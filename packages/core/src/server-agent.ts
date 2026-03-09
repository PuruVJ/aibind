import { generateText, streamText, stepCountIs, jsonSchema } from "ai";
import type { LanguageModel } from "./types";
import { AgentGraph } from "./agent-graph";
import { AgentStream } from "./agent-stream";

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
  /**
   * LangGraph-style state machine graph.
   * When set, `handle()` executes each node in sequence, routing between them
   * via edges and conditional routers. Overrides `toolsets` / `stopWhen` for
   * the handle() path (run() and stream() are unaffected).
   *
   * @example
   * ```ts
   * const graph = new AgentGraph()
   *   .addNode("search",    { tools: { web_search }, system: "Search the web." })
   *   .addNode("summarize", { system: "Summarize findings." })
   *   .addEdge("__start__", "search")
   *   .addConditionalEdges("search", (ctx) => ctx.hasResults ? "summarize" : "__end__")
   *   .addEdge("summarize", "__end__");
   *
   * const agent = new ServerAgent({ model, system: "Research assistant.", graph });
   * export const POST = ({ request }) => agent.handle(request);
   * ```
   */
  graph?: AgentGraph;
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
    Pick<AgentConfig, "toolsets" | "toolset" | "graph">;

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
      graph: config.graph,
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
   * When a `graph` is configured on this agent, the request is routed through
   * the state machine graph instead, streaming NDJSON events with `node-enter`
   * and `node-exit` lifecycle events between each node's output.
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
    if (this.#config.graph) return this.#runGraph(request);

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

  /**
   * Execute the configured graph, streaming NDJSON events for each node.
   * Each node runs its own `streamText()` tool loop; node-enter / node-exit
   * events bracket each node's output in the stream.
   */
  async #runGraph(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      messages: Array<{ role: string; content: string }>;
    };
    const graph = this.#config.graph!;
    const agentModel = this.#config.model as import("ai").LanguageModel;
    const agentSystem = this.#config.system;

    const readable = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          let ctx: Record<string, unknown> = {};
          // Accumulate the full message history across all nodes so each node
          // sees prior nodes' outputs as conversation history.
          let history: Array<{ role: "user" | "assistant"; content: string }> =
            body.messages.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }));

          let current = graph.nextNode("__start__", ctx);

          while (current !== "__end__") {
            const nodeConfig = graph.nodes.get(current);
            if (!nodeConfig) {
              throw new Error(
                `AgentGraph: node "${current}" is not registered.`,
              );
            }

            controller.enqueue(
              AgentStream.encodeEvent({ type: "node-enter", node: current }),
            );

            const nodeModel = nodeConfig.model
              ? (nodeConfig.model as import("ai").LanguageModel)
              : agentModel;
            const nodeSystem = nodeConfig.system ?? agentSystem;
            const nodeTools = nodeConfig.tools as
              | import("ai").ToolSet
              | undefined;
            const nodeStopWhen = nodeConfig.stopWhen;

            const result = streamText({
              model: nodeModel,
              system: nodeSystem,
              messages: history,
              ...(nodeTools ? { tools: nodeTools, stopWhen: nodeStopWhen } : {}),
            });

            let nodeText = "";

            for await (const part of result.fullStream) {
              // Accumulate text for history + context extraction
              if (part.type === "text-delta") {
                nodeText += (part as unknown as { text: string }).text ?? "";
              }
              // Re-serialize the part as an AgentStreamEvent and enqueue it
              const event = AgentStream.mapPart(
                part as Record<string, unknown>,
              );
              if (event) controller.enqueue(AgentStream.encodeEvent(event));
            }

            // Append this node's assistant turn to the shared history
            history = [
              ...history,
              { role: "assistant" as const, content: nodeText },
            ];

            // Merge any extracted context for routing
            const extracted =
              nodeConfig.extractContext?.({ text: nodeText }) ?? {};
            ctx = { ...ctx, ...extracted };

            controller.enqueue(
              AgentStream.encodeEvent({ type: "node-exit", node: current }),
            );

            // Human-in-the-loop pause: emit approval-request and stop.
            // The client must re-invoke with an approval token to continue.
            if (nodeConfig.requireApproval) {
              const approvalId = crypto.randomUUID();
              controller.enqueue(
                AgentStream.encodeEvent({
                  type: "approval-request",
                  approvalId,
                  toolCallId: "",
                  toolName: current,
                  args: { node: current, output: nodeText },
                }),
              );
              break;
            }

            current = graph.nextNode(current, ctx);
          }

          controller.enqueue(AgentStream.encodeEvent({ type: "done" }));
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            AgentStream.encodeEvent({ type: "error", error: message }),
          );
          controller.enqueue(AgentStream.encodeEvent({ type: "done" }));
          controller.close();
        }
      },
    });

    return AgentStream.createGraphResponse(readable);
  }
}
