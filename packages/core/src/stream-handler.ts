/**
 * Framework-agnostic stream handler.
 *
 * `StreamHandler` exposes individual typed methods for each AI endpoint.
 * Use it directly for custom routing/middleware, or use `createStreamHandler`
 * for the zero-config all-in-one Request → Response handler.
 */

import { streamText, generateText, Output, jsonSchema } from "ai";
import type { StreamStore } from "./stream-store";
import { MemoryStreamStore } from "./memory-store";
import { DurableStream } from "./durable-stream";
import { SSE } from "./sse";
import type { LanguageModel } from "./types";
import type {
  ConversationStore,
  ConversationMessage,
} from "./conversation-store";
import { ChatHistory } from "./chat-history";

const DEFAULT_COMPLETE_SYSTEM_PROMPT =
  "Continue the following text naturally. " +
  "Output only the continuation — nothing else.";

const DEFAULT_COMPACT_PROMPT =
  "Summarize the following conversation into a single dense paragraph that " +
  "preserves all important context, decisions, facts, and preferences. " +
  "This summary will replace the conversation history for a future AI session.";

export interface ConversationConfig {
  /** Pluggable store for conversation history. */
  store: ConversationStore;
  /**
   * Sliding window — only the most recent N messages are sent to the model.
   * Older messages are still persisted in the store. Default: unlimited.
   */
  maxMessages?: number;
  /**
   * System prompt used by the /compact endpoint when summarizing.
   * Defaults to a general-purpose summarization instruction.
   */
  compactSystemPrompt?: string;
}

export interface StreamHandlerConfig {
  /** Single model for all requests. */
  model?: LanguageModel;
  /** Named models — client selects via `model` key in request body. */
  models?: Record<string, LanguageModel>;
  /** Route prefix for the streaming endpoints. Default: '/__aibind__' */
  prefix?: string;
  /**
   * Enable resumable streams. When true, streams are buffered server-side
   * and clients can reconnect + resume from where they left off.
   */
  resumable?: boolean;
  /**
   * Custom StreamStore for resumable streams. Defaults to MemoryStreamStore.
   * Only used when `resumable: true`.
   */
  store?: StreamStore;
  /**
   * Enable server-side conversation history. When set, the handler maintains
   * multi-turn context keyed by `sessionId` from the request body.
   * Uses ChatHistory<ConversationMessage> — same tree structure as the client.
   */
  conversation?: ConversationConfig;
  /**
   * Automatically add Anthropic prompt caching to the system prompt.
   * When `true`, a `cache_control: { type: "ephemeral" }` breakpoint is added
   * for requests served by an Anthropic model — reducing input token costs by ~90%.
   * Requires `@ai-sdk/anthropic` as the model provider (not OpenRouter).
   */
  cacheSystemPrompt?: boolean;
}

// --- Typed request body interfaces ---

export interface StreamRequestBody {
  prompt: string;
  system?: string;
  model?: string;
  sessionId?: string;
}

export interface StructuredStreamRequestBody extends StreamRequestBody {
  schema?: unknown;
}

export interface CompactRequestBody {
  messages: ConversationMessage[];
  model?: string;
  sessionId?: string;
}

export interface StopRequestBody {
  id: string;
}

export interface CompleteRequestBody {
  input: string;
  system?: string;
  model?: string;
}

export interface ChatRequestBody {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  system?: string;
  model?: string;
}

/**
 * Individual typed responders for each AI endpoint.
 *
 * Instantiate directly for custom routing, middleware, or non-standard frameworks.
 * Each method accepts a pre-parsed body and returns a standard `Response`.
 *
 * @example
 * ```ts
 * // Hono
 * import { Hono } from 'hono';
 * import { StreamHandler } from '@aibind/core';
 *
 * const ai = new StreamHandler({ models });
 * const app = new Hono();
 *
 * app.post('/__aibind__/stream', async (c) => ai.stream(await c.req.json()));
 * app.post('/__aibind__/compact', async (c) => ai.compact(await c.req.json()));
 * ```
 *
 * @example
 * ```ts
 * // Next.js with auth middleware
 * const ai = new StreamHandler({ models });
 *
 * export async function POST(request: Request) {
 *   const session = await getSession(request);
 *   if (!session) return new Response('Unauthorized', { status: 401 });
 *
 *   const body = await request.json();
 *   return ai.stream({ ...body, sessionId: session.userId });
 * }
 * ```
 *
 * @example
 * ```ts
 * // Express (with a Web Response → express res adapter)
 * const ai = new StreamHandler({ models });
 *
 * app.post('/__aibind__/stream', async (req, res) => {
 *   const response = await ai.stream(req.body);
 *   res.status(response.status);
 *   response.headers.forEach((v, k) => res.setHeader(k, v));
 *   Readable.fromWeb(response.body!).pipe(res);
 * });
 * ```
 */
export class StreamHandler {
  readonly #config: StreamHandlerConfig;
  readonly #store: StreamStore | null;
  readonly #activeStreams: Map<string, DurableStream>;

  constructor(config: StreamHandlerConfig) {
    this.#config = config;
    this.#store = config.resumable
      ? (config.store ?? new MemoryStreamStore())
      : null;
    this.#activeStreams = new Map();
  }

  #isAnthropicModel(model: import("ai").LanguageModel): boolean {
    const provider = (model as Record<string, unknown>).provider;
    return typeof provider === "string" && provider.startsWith("anthropic");
  }

  #resolveModel(requested?: string): import("ai").LanguageModel {
    const { models, model } = this.#config;
    if (models) {
      const key = requested ?? Object.keys(models)[0];
      const resolved = models[key];
      if (!resolved) throw new Error(`Unknown model key: "${key}"`);
      return resolved as import("ai").LanguageModel;
    }
    if (!model)
      throw new Error("No model configured — provide `model` or `models`");
    return model as import("ai").LanguageModel;
  }

  async #handleStream(
    body: StructuredStreamRequestBody,
    structured: boolean,
  ): Promise<Response> {
    const { prompt, system, model: requestedModel, sessionId, schema } = body;

    if (typeof prompt !== "string" || !prompt.trim()) {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }

    let model: import("ai").LanguageModel;
    try {
      model = this.#resolveModel(requestedModel);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 400 });
    }

    const output = structured
      ? schema
        ? Output.object({ schema: jsonSchema(schema as never) })
        : Output.json()
      : undefined;

    // Conversation history (server-side sessions)
    const convConfig = this.#config.conversation;
    let chat: ChatHistory<ConversationMessage> | null = null;
    let history: ConversationMessage[] = [];

    if (convConfig && typeof sessionId === "string" && sessionId) {
      chat = await convConfig.store.load(sessionId);
      history = chat.messages;
      if (convConfig.maxMessages) {
        history = history.slice(-convConfig.maxMessages);
      }
    }

    const userMsg: ConversationMessage = { role: "user", content: prompt };
    const capturedChat = chat;
    const capturedSessionId = sessionId;

    const onFinish =
      capturedChat !== null
        ? async ({ text }: { text: string }) => {
            capturedChat.append(userMsg);
            capturedChat.append({ role: "assistant", content: text });
            await convConfig!.store.save(
              capturedSessionId as string,
              capturedChat,
            );
          }
        : undefined;

    const shouldCachePrompt =
      this.#config.cacheSystemPrompt &&
      !!system &&
      this.#isAnthropicModel(model);

    const result = streamText({
      model,
      ...(history.length > 0
        ? { messages: [...history, userMsg] }
        : { prompt }),
      system,
      ...(output && { output }),
      ...(onFinish && { onFinish }),
      ...(shouldCachePrompt && {
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      }),
    });

    if (!this.#store) {
      return StreamHandler.#buildSSEResponse(result);
    }

    const durableStream = await DurableStream.create({
      store: this.#store,
      source: result.textStream,
    });
    this.#activeStreams.set(durableStream.id, durableStream);
    return durableStream.response;
  }

  /**
   * Build an SSE response that streams text chunks then emits a trailing
   * `usage` event with token counts before the terminal `done` event.
   */
  static #buildSSEResponse(result: ReturnType<typeof streamText>): Response {
    const encoder = new TextEncoder();
    let seq = 0;

    const readable = new ReadableStream({
      async start(ctrl) {
        try {
          for await (const chunk of result.textStream) {
            ctrl.enqueue(encoder.encode(SSE.format(seq++, chunk)));
          }
          const usage = await result.usage;
          ctrl.enqueue(
            encoder.encode(
              SSE.formatEvent(
                "usage",
                JSON.stringify({
                  inputTokens: usage.inputTokens ?? 0,
                  outputTokens: usage.outputTokens ?? 0,
                }),
              ),
            ),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          ctrl.enqueue(encoder.encode(SSE.formatEvent("error", msg)));
        }
        ctrl.enqueue(encoder.encode(SSE.formatEvent("done")));
        ctrl.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  /** Handle a plain text streaming request. */
  stream(body: StreamRequestBody): Promise<Response> {
    return this.#handleStream(body, false);
  }

  /** Handle a structured (JSON) streaming request. */
  structuredStream(body: StructuredStreamRequestBody): Promise<Response> {
    return this.#handleStream(body, true);
  }

  /**
   * Summarize a conversation and return `{ summary, tokensSaved }`.
   * `tokensSaved` is the net token reduction (input tokens − output tokens).
   */
  async compact(body: CompactRequestBody): Promise<Response> {
    const { messages, model: requestedModel, sessionId } = body;

    if (!Array.isArray(messages)) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }

    let model: import("ai").LanguageModel;
    try {
      model = this.#resolveModel(requestedModel);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 400 });
    }

    const convConfig = this.#config.conversation;
    const systemPrompt =
      convConfig?.compactSystemPrompt ?? DEFAULT_COMPACT_PROMPT;

    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");

    const { text, usage } = await generateText({
      model,
      prompt: `${systemPrompt}\n\n---\n\n${conversationText}`,
    });

    if (convConfig && typeof sessionId === "string" && sessionId) {
      const chat = await convConfig.store.load(sessionId);
      chat.compact({ role: "system", content: text });
      await convConfig.store.save(sessionId, chat);
    }

    const tokensSaved = (usage.inputTokens ?? 0) - (usage.outputTokens ?? 0);
    return Response.json({ summary: text, tokensSaved });
  }

  /**
   * Generate an inline completion for a partial input string.
   * Returns the continuation text only (not the input itself).
   */
  async complete(body: CompleteRequestBody): Promise<Response> {
    const { input, system, model: requestedModel } = body;

    if (typeof input !== "string" || !input.trim()) {
      return Response.json({ error: "input is required" }, { status: 400 });
    }

    let model: import("ai").LanguageModel;
    try {
      model = this.#resolveModel(requestedModel);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 400 });
    }

    const { text } = await generateText({
      model,
      system: system ?? DEFAULT_COMPLETE_SYSTEM_PROMPT,
      prompt: input,
    });

    return new Response(text, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  /**
   * Stream a multi-turn chat response.
   * Accepts a messages array and returns a plain text streaming response.
   * The client-side `ChatController` consumes this with `consumeTextStream`.
   */
  async chat(body: ChatRequestBody): Promise<Response> {
    const { messages, system, model: requestedModel } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }

    let model: import("ai").LanguageModel;
    try {
      model = this.#resolveModel(requestedModel);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 400 });
    }

    const result = streamText({ model, system, messages });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(ctrl) {
        try {
          for await (const chunk of result.textStream) {
            ctrl.enqueue(encoder.encode(chunk));
          }
        } catch {
          // Ignore — client will see a truncated stream
        }
        ctrl.close();
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  /** Stop a durable stream by ID (requires `resumable: true`). */
  async stop(body: StopRequestBody): Promise<Response> {
    const { id } = body;
    if (typeof id !== "string") {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const stream = this.#activeStreams.get(id);
    if (stream) {
      stream.stop();
      this.#activeStreams.delete(id);
    }

    if (this.#store) {
      try {
        await this.#store.stop(id);
      } catch {
        // Stream may already be stopped/completed
      }
    }

    return Response.json({ ok: true });
  }

  /** Resume a durable stream. Pass the full request URL for `?id=` and `?after=` params. */
  resume(url: URL): Response {
    if (!this.#store) {
      return Response.json(
        { error: "Resumable streams not enabled" },
        { status: 400 },
      );
    }

    const streamId = url.searchParams.get("id");
    const afterSeq = parseInt(url.searchParams.get("after") ?? "0", 10);

    if (!streamId) {
      return Response.json(
        { error: "id parameter is required" },
        { status: 400 },
      );
    }

    return DurableStream.resume({ store: this.#store, streamId, afterSeq });
  }

  /**
   * All-in-one Request → Response handler with built-in routing.
   * Equivalent to calling the function returned by `createStreamHandler`.
   */
  async handle(request: Request): Promise<Response> {
    const prefix = this.#config.prefix ?? "/__aibind__";
    const resumable = this.#config.resumable ?? false;
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "POST") {
      if (pathname === `${prefix}/stream`) {
        return this.stream(await request.json());
      }
      if (pathname === `${prefix}/structured`) {
        return this.structuredStream(await request.json());
      }
      if (pathname === `${prefix}/compact`) {
        return this.compact(await request.json());
      }
      if (pathname === `${prefix}/chat`) {
        return this.chat(await request.json());
      }
      if (pathname === `${prefix}/complete`) {
        return this.complete(await request.json());
      }
      if (resumable && pathname === `${prefix}/stream/stop`) {
        return this.stop(await request.json());
      }
    }

    if (request.method === "GET") {
      if (resumable && pathname === `${prefix}/stream/resume`) {
        return this.resume(url);
      }
    }

    return new Response("Not Found", { status: 404 });
  }
}

/**
 * Create an all-in-one Request → Response handler for streaming endpoints.
 * Works with any framework that uses Web standard Request/Response.
 *
 * For custom routing or middleware, instantiate `StreamHandler` directly.
 */
export function createStreamHandler(
  config: StreamHandlerConfig,
): (request: Request) => Promise<Response> {
  const handler = new StreamHandler(config);
  return (request: Request) => handler.handle(request);
}
