import { generateText, streamText, stepCountIs, jsonSchema } from "ai";
import type { LanguageModel } from "./types";

export interface AgentConfig {
  model?: LanguageModel;
  system: string;
  /**
   * Named toolsets available to this agent.
   * The client (or `toolset` default) selects which one to activate per request.
   */
  toolsets?: Record<string, Record<string, unknown>>;
  /**
   * Server-side default toolset. Used when the client sends no `toolset` key.
   * Omitting this means no tools are active unless the client explicitly requests one.
   */
  toolset?: string;
  /** When to stop the tool loop. Use AI SDK helpers like `stepCountIs(5)`. */
  stopWhen?:
    | import("ai").StopCondition<any>
    | Array<import("ai").StopCondition<any>>;
}

export interface RunOptions {
  messages?: Array<{ role: string; content: string }>;
  /** Override the toolset for this call. Resolved against `config.toolsets`. */
  toolset?: string;
}

/**
 * Server-side agent with toolsets and a system prompt.
 * Uses AI SDK's generateText/streamText with stopWhen for multi-step tool loops.
 */
export class ServerAgent {
  #config: Required<Pick<AgentConfig, "model" | "system" | "stopWhen">> &
    Pick<AgentConfig, "toolsets" | "toolset">;

  constructor(config: AgentConfig) {
    if (!config.model) {
      throw new Error("ServerAgent: model is required in agent config.");
    }
    this.#config = {
      model: config.model,
      system: config.system,
      toolsets: config.toolsets,
      toolset: config.toolset,
      stopWhen: config.stopWhen ?? stepCountIs(10),
    };
  }

  #resolveTools(toolsetKey?: string): Record<string, unknown> | undefined {
    const key = toolsetKey ?? this.#config.toolset ?? null;
    if (key == null || !this.#config.toolsets) return undefined;
    return this.#config.toolsets[key] ?? undefined;
  }

  #baseOpts(toolsetKey?: string) {
    const tools = this.#resolveTools(toolsetKey);
    return {
      model: this.#config.model as import("ai").LanguageModel,
      system: this.#config.system,
      ...(tools && { tools: tools as import("ai").ToolSet }),
      stopWhen: this.#config.stopWhen,
    };
  }

  #buildMessages(prompt: string, previous?: RunOptions["messages"]) {
    if (previous?.length) {
      return [
        ...previous.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: prompt },
      ];
    }
    return undefined;
  }

  /** Stream a response. Returns StreamTextResult synchronously — no await needed. */
  stream(
    prompt: string,
    options?: RunOptions,
  ): import("ai").StreamTextResult<any, any> {
    const messages = this.#buildMessages(prompt, options?.messages);
    return streamText({
      ...this.#baseOpts(options?.toolset),
      ...(messages ? { messages } : { prompt }),
    });
  }

  /** Generate a complete response (non-streaming). */
  async run(
    prompt: string,
    options?: RunOptions,
  ): Promise<import("ai").GenerateTextResult<any, any>> {
    const messages = this.#buildMessages(prompt, options?.messages);
    return generateText({
      ...this.#baseOpts(options?.toolset),
      ...(messages ? { messages } : { prompt }),
    });
  }

  /**
   * Wrap this agent as an AI SDK tool so it can be called by another agent or
   * by Chat (via toolsets). The inner agent runs to completion (`generateText`)
   * before returning its text to the outer loop.
   *
   * Because the returned tool is a plain AI SDK `tool()`, it works in both
   * `ServerAgent` toolsets and `createStreamHandler` toolsets — define once,
   * share between Chat and Agent contexts.
   *
   * @example
   * ```ts
   * const researcher = new ServerAgent({ model, system: "Research topics." });
   *
   * export const toolsets = {
   *   default: {
   *     research: researcher.asTool("Research a topic in depth"),
   *   },
   * };
   *
   * // Works in both:
   * export const handle = createStreamHandler({ models, toolsets });
   * const orchestrator = new ServerAgent({ model, system: "...", toolsets, toolset: "default" });
   * ```
   */
  asTool(description: string): import("ai").Tool {
    return {
      description,
      inputSchema: jsonSchema<{ prompt: string }>({
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The task or question for this agent",
          },
        },
        required: ["prompt"],
      }),
      execute: async ({ prompt }: { prompt: string }) => {
        const result = await this.run(prompt);
        return result.text;
      },
    };
  }

  /**
   * Web Request → Response handler for use as a route export.
   * Reads `{ messages, toolset? }` from the JSON body and streams a response.
   *
   * ```ts
   * // SvelteKit
   * export const POST = ({ request }) => agent.handle(request);
   *
   * // Next.js App Router
   * export const POST = agent.handle.bind(agent);
   * ```
   */
  async handle(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      messages: Array<{ role: string; content: string }>;
      toolset?: string;
    };
    const { messages, toolset } = body;
    const lastMessage = messages[messages.length - 1];
    const result = this.stream(lastMessage.content, {
      messages: messages.slice(0, -1),
      toolset,
    });
    return result.toTextStreamResponse();
  }
}
