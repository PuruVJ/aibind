/**
 * LangGraph-style state machine graph for ServerAgent.
 *
 * Defines a directed graph of named nodes, where each node is a mini-agent
 * configuration (tools, system prompt, model). Edges control which node runs
 * next — either statically (addEdge) or conditionally via a router function
 * that reads accumulated context (addConditionalEdges).
 *
 * Reserved node names: `"__start__"` (entry), `"__end__"` (exit).
 *
 * @example
 * ```ts
 * const graph = new AgentGraph()
 *   .addNode("search",    { tools: { web_search }, system: "Search the web." })
 *   .addNode("summarize", { system: "Summarize the findings." })
 *   .addEdge("__start__", "search")
 *   .addConditionalEdges("search", (ctx) => ctx.hasResults ? "summarize" : "__end__")
 *   .addEdge("summarize", "__end__");
 *
 * const agent = new ServerAgent({ model, system: "Research assistant.", graph });
 * export const POST = ({ request }) => agent.handle(request);
 * ```
 */

import { stepCountIs } from "ai";
import type { LanguageModel } from "./types";

export interface AgentNodeConfig {
  /**
   * System prompt for this node. Overrides the parent ServerAgent system.
   * When omitted, the ServerAgent system prompt is used.
   */
  system?: string;
  /**
   * Model override for this node. Overrides the parent ServerAgent model.
   * When omitted, the ServerAgent model is used.
   */
  model?: LanguageModel;
  /**
   * Tools available within this node's tool loop.
   * When omitted, this node runs without tools (pure text generation).
   */
  tools?: Record<string, unknown>;
  /**
   * When to stop this node's internal tool loop. Defaults to `stepCountIs(5)`.
   * Only relevant when `tools` is set.
   */
  stopWhen?:
    | import("ai").StopCondition<any>
    | Array<import("ai").StopCondition<any>>;
  /**
   * Extract key/value pairs from this node's output text to make available
   * to downstream router functions via the graph context object.
   *
   * @example
   * ```ts
   * extractContext: ({ text }) => ({ hasResults: text.includes("found") })
   * ```
   */
  extractContext?: (output: { text: string }) => Record<string, unknown>;
  /**
   * When true, the graph pauses after this node completes and emits an
   * `approval-request` event before advancing to the next node.
   * The client must send an explicit approval to continue.
   */
  requireApproval?: boolean;
}

/**
 * Router function for conditional edges.
 * Receives the accumulated graph context and returns the name of the next node
 * (or `"__end__"` to terminate the graph).
 */
export type RouterFn = (ctx: Record<string, unknown>) => string;

/** @internal Default stopWhen for nodes that don't specify one. */
const DEFAULT_NODE_STOP_WHEN = stepCountIs(5);

/**
 * Directed graph of named agent nodes.
 *
 * Use the fluent builder API to define nodes and edges, then pass the
 * completed graph to `ServerAgent` via the `graph` option.
 */
export class AgentGraph {
  readonly nodes: Map<string, AgentNodeConfig> = new Map();
  readonly edges: Map<string, string> = new Map();
  readonly conditionalEdges: Map<string, RouterFn> = new Map();

  /**
   * Register a named node with its configuration.
   * The name must not be `"__start__"` or `"__end__"` (reserved).
   */
  addNode(name: string, config: AgentNodeConfig): this {
    if (name === "__start__" || name === "__end__") {
      throw new Error(
        `AgentGraph: "${name}" is a reserved node name and cannot be registered.`,
      );
    }
    this.nodes.set(name, {
      ...config,
      stopWhen: config.stopWhen ?? DEFAULT_NODE_STOP_WHEN,
    });
    return this;
  }

  /**
   * Add a static edge from one node to another.
   * `from` may be `"__start__"` to set the entry point.
   * `to` may be `"__end__"` to terminate after this node.
   *
   * A node may only have one outgoing edge (static OR conditional).
   */
  addEdge(from: string, to: string): this {
    if (this.conditionalEdges.has(from)) {
      throw new Error(
        `AgentGraph: node "${from}" already has a conditional edge. A node may only have one outgoing edge.`,
      );
    }
    this.edges.set(from, to);
    return this;
  }

  /**
   * Add a conditional edge from a node.
   * The `router` function is called after the node completes, receives the
   * accumulated context, and returns the next node name (or `"__end__"`).
   *
   * A node may only have one outgoing edge (static OR conditional).
   */
  addConditionalEdges(from: string, router: RouterFn): this {
    if (this.edges.has(from)) {
      throw new Error(
        `AgentGraph: node "${from}" already has a static edge. A node may only have one outgoing edge.`,
      );
    }
    this.conditionalEdges.set(from, router);
    return this;
  }

  /**
   * Resolve the next node name given the current node and accumulated context.
   * Returns `"__end__"` if no edge is defined (terminates the graph).
   */
  nextNode(from: string, ctx: Record<string, unknown>): string {
    const conditionalRouter = this.conditionalEdges.get(from);
    if (conditionalRouter) return conditionalRouter(ctx);

    const staticTarget = this.edges.get(from);
    if (staticTarget) return staticTarget;

    return "__end__";
  }

  /**
   * Validate the graph structure. Throws if:
   * - No entry edge from `"__start__"` is defined
   * - Any static edge targets a node that has not been registered
   *   (unless the target is `"__end__"`)
   */
  validate(): void {
    if (!this.edges.has("__start__") && !this.conditionalEdges.has("__start__")) {
      throw new Error(
        'AgentGraph: no entry point defined. Call addEdge("__start__", firstNode).',
      );
    }
    for (const [from, to] of this.edges) {
      if (from === "__start__") continue;
      if (!this.nodes.has(from) && from !== "__end__") {
        throw new Error(
          `AgentGraph: edge source "${from}" has not been registered as a node.`,
        );
      }
      if (to !== "__end__" && !this.nodes.has(to)) {
        throw new Error(
          `AgentGraph: edge target "${to}" from node "${from}" has not been registered.`,
        );
      }
    }
  }
}
