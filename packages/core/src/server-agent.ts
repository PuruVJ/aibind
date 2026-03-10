import { generateText, streamText, jsonSchema } from "ai";
import type { LanguageModel } from "./types";
import { AgentGraph } from "./agent-graph";
import { AgentStream } from "./agent-stream";

export interface AgentConfig {
  model?: LanguageModel;
  system: string;
}

export interface RunOptions {
  messages?: Array<{ role: string; content: string }>;
}

/**
 * Server-side graph agent. Extends `AgentGraph` — chain `addNode / addEdge /
 * addConditionalEdges` directly on the instance, then export `handle` as the
 * route handler.
 *
 * @example
 * ```ts
 * const agent = new ServerAgent({ model, system: "Research assistant." })
 *   .addNode("search",    { tools: { web_search }, system: "Search the web." })
 *   .addNode("summarize", { system: "Summarize findings." })
 *   .addEdge("__start__", "search")
 *   .addConditionalEdges("search", (ctx) => ctx.hasResults ? "summarize" : "__end__")
 *   .addEdge("summarize", "__end__");
 *
 * export const POST = ({ request }) => agent.handle(request);
 * ```
 *
 * To share a graph across agents, define it with `new AgentGraph()` and
 * import it via `.use(graph)`:
 *
 * ```ts
 * export const researchGraph = new AgentGraph()
 *   .addNode("research", { tools: { web_search }, system: "Research." })
 *   .addEdge("__start__", "research")
 *   .addEdge("research", "__end__");
 *
 * const fast = new ServerAgent({ model: models.fast, system: "..." }).use(researchGraph);
 * const deep = new ServerAgent({ model: models.deep, system: "..." }).use(researchGraph);
 * ```
 */
export class ServerAgent extends AgentGraph {
  #model: import("ai").LanguageModel;
  #system: string;

  constructor(config: AgentConfig) {
    super();
    if (!config.model) {
      throw new Error("ServerAgent: model is required in agent config.");
    }
    this.#model = config.model as import("ai").LanguageModel;
    this.#system = config.system;
  }

  // --- Execution helpers ---

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

  /** Stream a response (no tools). Returns StreamTextResult synchronously — no await needed. */
  stream(
    prompt: string,
    options?: RunOptions,
  ): import("ai").StreamTextResult<any, any> {
    const messages = this.#buildMessages(prompt, options?.messages);
    return streamText({
      model: this.#model,
      system: this.#system,
      ...(messages ? { messages } : { prompt }),
    });
  }

  /** Generate a complete response (no tools, non-streaming). */
  async run(
    prompt: string,
    options?: RunOptions,
  ): Promise<import("ai").GenerateTextResult<any, any>> {
    const messages = this.#buildMessages(prompt, options?.messages);
    return generateText({
      model: this.#model,
      system: this.#system,
      ...(messages ? { messages } : { prompt }),
    });
  }

  /**
   * Wrap this agent as an AI SDK tool so it can be called by another agent or
   * by Chat. The inner agent runs to completion (`generateText`) before
   * returning its text to the outer loop as a tool result.
   *
   * @example
   * ```ts
   * const researcher = new ServerAgent({ model, system: "Research topics." })
   *   .addNode("research", { tools: { web_search }, system: "Research." })
   *   .addEdge("__start__", "research")
   *   .addEdge("research", "__end__");
   *
   * export const toolsets = {
   *   default: { research: researcher.asTool("Research a topic in depth") },
   * };
   * export const handle = createStreamHandler({ models, toolsets });
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
   * Reads `{ messages }` from the JSON body and executes the graph,
   * streaming NDJSON events with `node-enter` / `node-exit` lifecycle events.
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
    return this.#runGraph(request);
  }

  /**
   * Execute the graph, streaming NDJSON events for each node.
   * Each node runs its own `streamText()` tool loop; node-enter / node-exit
   * events bracket each node's output in the stream.
   */
  async #runGraph(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      messages: Array<{ role: string; content: string }>;
    };
    const agentModel = this.#model;
    const agentSystem = this.#system;

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

          let current = this.nextNode("__start__", ctx);

          while (current !== "__end__") {
            const nodeConfig = this.nodes.get(current);
            if (!nodeConfig) {
              throw new Error(
                `ServerAgent: node "${current}" is not registered.`,
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
              ...(nodeTools
                ? { tools: nodeTools, stopWhen: nodeStopWhen }
                : {}),
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

            current = this.nextNode(current, ctx);
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
