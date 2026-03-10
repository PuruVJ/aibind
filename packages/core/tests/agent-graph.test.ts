import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentGraph, type AgentNodeConfig } from "../src/agent-graph";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<AgentNodeConfig> = {}): AgentNodeConfig {
  return { system: "You are helpful.", ...overrides };
}

// ─── AgentGraph construction ───────────────────────────────────────────────────

describe("AgentGraph — node registration", () => {
  it("registers nodes and makes them accessible", () => {
    const graph = new AgentGraph()
      .addNode("search", makeNode({ system: "Search the web." }))
      .addNode("summarize", makeNode({ system: "Summarize results." }));

    expect(graph.nodes.has("search")).toBe(true);
    expect(graph.nodes.has("summarize")).toBe(true);
    expect(graph.nodes.get("search")!.system).toBe("Search the web.");
  });

  it("throws when registering a node named __start__", () => {
    expect(() => new AgentGraph().addNode("__start__", makeNode())).toThrow(
      /"__start__" is a reserved node name/,
    );
  });

  it("throws when registering a node named __end__", () => {
    expect(() => new AgentGraph().addNode("__end__", makeNode())).toThrow(
      /"__end__" is a reserved node name/,
    );
  });

  it("fluent API returns the same graph instance", () => {
    const graph = new AgentGraph();
    const result = graph.addNode("a", makeNode());
    expect(result).toBe(graph);
  });

  it("stores default stopWhen when none provided", () => {
    const graph = new AgentGraph().addNode("node", makeNode());
    // The default is set — just verify it's truthy (stepCountIs(5) return value)
    expect(graph.nodes.get("node")!.stopWhen).toBeDefined();
  });

  it("preserves user-supplied stopWhen", () => {
    const customStop = { type: "custom" } as any;
    const graph = new AgentGraph().addNode(
      "node",
      makeNode({ stopWhen: customStop }),
    );
    expect(graph.nodes.get("node")!.stopWhen).toBe(customStop);
  });

  it("stores tools on the node config", () => {
    const tools = { web_search: { execute: vi.fn() } };
    const graph = new AgentGraph().addNode("search", makeNode({ tools }));
    expect(graph.nodes.get("search")!.tools).toBe(tools);
  });

  it("stores extractContext on the node config", () => {
    const extract = vi.fn(() => ({ hasResults: true }));
    const graph = new AgentGraph().addNode(
      "search",
      makeNode({ extractContext: extract }),
    );
    expect(graph.nodes.get("search")!.extractContext).toBe(extract);
  });

  it("stores requireApproval flag", () => {
    const graph = new AgentGraph().addNode(
      "review",
      makeNode({ requireApproval: true }),
    );
    expect(graph.nodes.get("review")!.requireApproval).toBe(true);
  });
});

// ─── Edge registration ─────────────────────────────────────────────────────────

describe("AgentGraph — static edges", () => {
  it("registers a static edge and makes it accessible", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addEdge("__start__", "a")
      .addEdge("a", "__end__");

    expect(graph.edges.get("__start__")).toBe("a");
    expect(graph.edges.get("a")).toBe("__end__");
  });

  it("fluent addEdge returns the same graph instance", () => {
    const graph = new AgentGraph().addNode("a", makeNode());
    expect(graph.addEdge("__start__", "a")).toBe(graph);
  });

  it("throws when adding a static edge on a node that already has a conditional edge", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addConditionalEdges("a", () => "__end__");

    expect(() => graph.addEdge("a", "__end__")).toThrow(
      /already has a conditional edge/,
    );
  });
});

// ─── Conditional edges ─────────────────────────────────────────────────────────

describe("AgentGraph — conditional edges", () => {
  it("registers a conditional edge", () => {
    const router = vi.fn(() => "__end__");
    const graph = new AgentGraph()
      .addNode("search", makeNode())
      .addConditionalEdges("search", router);

    expect(graph.conditionalEdges.has("search")).toBe(true);
    expect(graph.conditionalEdges.get("search")).toBe(router);
  });

  it("fluent addConditionalEdges returns the same graph instance", () => {
    const graph = new AgentGraph().addNode("a", makeNode());
    expect(graph.addConditionalEdges("a", () => "__end__")).toBe(graph);
  });

  it("throws when adding a conditional edge on a node that already has a static edge", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addEdge("a", "__end__");

    expect(() => graph.addConditionalEdges("a", () => "__end__")).toThrow(
      /already has a static edge/,
    );
  });
});

// ─── nextNode resolution ───────────────────────────────────────────────────────

describe("AgentGraph.nextNode", () => {
  it("resolves __start__ → first node via static edge", () => {
    const graph = new AgentGraph()
      .addNode("search", makeNode())
      .addEdge("__start__", "search");

    expect(graph.nextNode("__start__", {})).toBe("search");
  });

  it("resolves static edge from node → __end__", () => {
    const graph = new AgentGraph()
      .addNode("search", makeNode())
      .addEdge("__start__", "search")
      .addEdge("search", "__end__");

    expect(graph.nextNode("search", {})).toBe("__end__");
  });

  it("resolves static edge between two nodes", () => {
    const graph = new AgentGraph()
      .addNode("search", makeNode())
      .addNode("summarize", makeNode())
      .addEdge("search", "summarize");

    expect(graph.nextNode("search", {})).toBe("summarize");
  });

  it("invokes conditional router with current context", () => {
    const router = vi.fn((ctx: Record<string, unknown>) =>
      ctx.found ? "summarize" : "__end__",
    );
    const graph = new AgentGraph()
      .addNode("search", makeNode())
      .addNode("summarize", makeNode())
      .addConditionalEdges("search", router);

    expect(graph.nextNode("search", { found: true })).toBe("summarize");
    expect(graph.nextNode("search", { found: false })).toBe("__end__");
    expect(router).toHaveBeenCalledTimes(2);
    expect(router).toHaveBeenCalledWith({ found: true });
    expect(router).toHaveBeenCalledWith({ found: false });
  });

  it("prefers conditional over static when both exist (conditional takes priority)", () => {
    // This can't actually happen due to the mutex enforcement in addEdge/addConditionalEdges,
    // but we test the resolution order directly to confirm conditional runs first.
    const graph = new AgentGraph().addNode("a", makeNode());
    // Force-inject both (bypass the guards for unit testing resolution logic)
    graph.edges.set("a", "static-target");
    graph.conditionalEdges.set("a", () => "conditional-target");

    expect(graph.nextNode("a", {})).toBe("conditional-target");
  });

  it("returns __end__ when no outgoing edge is defined", () => {
    const graph = new AgentGraph().addNode("isolated", makeNode());
    expect(graph.nextNode("isolated", {})).toBe("__end__");
  });

  it("context is passed unchanged — router cannot mutate the original", () => {
    const captured: Record<string, unknown>[] = [];
    const router = (ctx: Record<string, unknown>) => {
      captured.push(ctx);
      return "__end__";
    };
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addConditionalEdges("a", router);

    const ctx = { key: "value" };
    graph.nextNode("a", ctx);
    expect(captured[0]).toBe(ctx); // same reference passed
  });
});

// ─── Multi-node chain traversal simulation ─────────────────────────────────────

describe("AgentGraph — full traversal simulation", () => {
  it("linear chain: __start__ → a → b → __end__", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addNode("b", makeNode())
      .addEdge("__start__", "a")
      .addEdge("a", "b")
      .addEdge("b", "__end__");

    const visited: string[] = [];
    let current = graph.nextNode("__start__", {});
    while (current !== "__end__") {
      visited.push(current);
      current = graph.nextNode(current, {});
    }
    expect(visited).toEqual(["a", "b"]);
  });

  it("conditional branch: ctx.route determines path", () => {
    const graph = new AgentGraph()
      .addNode("router-node", makeNode())
      .addNode("path-a", makeNode())
      .addNode("path-b", makeNode())
      .addEdge("__start__", "router-node")
      .addConditionalEdges("router-node", (ctx) =>
        ctx.route === "a" ? "path-a" : "path-b",
      )
      .addEdge("path-a", "__end__")
      .addEdge("path-b", "__end__");

    // Route A
    const visitedA: string[] = [];
    let cur = graph.nextNode("__start__", {});
    let ctx: Record<string, unknown> = { route: "a" };
    while (cur !== "__end__") {
      visitedA.push(cur);
      cur = graph.nextNode(cur, ctx);
    }
    expect(visitedA).toEqual(["router-node", "path-a"]);

    // Route B
    const visitedB: string[] = [];
    cur = graph.nextNode("__start__", {});
    ctx = { route: "b" };
    while (cur !== "__end__") {
      visitedB.push(cur);
      cur = graph.nextNode(cur, ctx);
    }
    expect(visitedB).toEqual(["router-node", "path-b"]);
  });

  it("context accumulates across nodes (simulates extractContext merging)", () => {
    const graph = new AgentGraph()
      .addNode("fetch", makeNode())
      .addNode("parse", makeNode())
      .addNode("store", makeNode())
      .addEdge("__start__", "fetch")
      .addConditionalEdges("fetch", (ctx) =>
        ctx.fetched ? "parse" : "__end__",
      )
      .addConditionalEdges("parse", (ctx) => (ctx.parsed ? "store" : "__end__"))
      .addEdge("store", "__end__");

    // Simulate extractContext merging at each step
    const nodeExtracts: Record<string, () => Record<string, unknown>> = {
      fetch: () => ({ fetched: true }),
      parse: () => ({ parsed: true }),
      store: () => ({ stored: true }),
    };

    const visited: string[] = [];
    let cur = graph.nextNode("__start__", {});
    let ctx: Record<string, unknown> = {};

    while (cur !== "__end__") {
      visited.push(cur);
      // Simulate extractContext
      ctx = { ...ctx, ...(nodeExtracts[cur]?.() ?? {}) };
      cur = graph.nextNode(cur, ctx);
    }

    expect(visited).toEqual(["fetch", "parse", "store"]);
    expect(ctx).toEqual({ fetched: true, parsed: true, stored: true });
  });

  it("early exit via conditional: stops at second node if condition not met", () => {
    const graph = new AgentGraph()
      .addNode("check", makeNode())
      .addNode("process", makeNode())
      .addEdge("__start__", "check")
      .addConditionalEdges("check", (ctx) =>
        ctx.hasData ? "process" : "__end__",
      )
      .addEdge("process", "__end__");

    const visited: string[] = [];
    let cur = graph.nextNode("__start__", {});
    const ctx = { hasData: false };

    while (cur !== "__end__") {
      visited.push(cur);
      cur = graph.nextNode(cur, ctx);
    }

    expect(visited).toEqual(["check"]);
  });
});

// ─── validate() ───────────────────────────────────────────────────────────────

describe("AgentGraph.validate", () => {
  it("passes for a valid linear graph", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addNode("b", makeNode())
      .addEdge("__start__", "a")
      .addEdge("a", "b")
      .addEdge("b", "__end__");

    expect(() => graph.validate()).not.toThrow();
  });

  it("passes for a valid conditional graph", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addNode("b", makeNode())
      .addEdge("__start__", "a")
      .addConditionalEdges("a", () => "b")
      .addEdge("b", "__end__");

    expect(() => graph.validate()).not.toThrow();
  });

  it("throws when no __start__ edge is defined", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addEdge("a", "__end__");

    expect(() => graph.validate()).toThrow(/no entry point defined/);
  });

  it("throws when static edge targets an unregistered node", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addEdge("__start__", "a")
      .addEdge("a", "ghost"); // "ghost" not registered

    expect(() => graph.validate()).toThrow(
      /edge target "ghost".*not been registered/,
    );
  });

  it("does not throw for edges to __end__ even when __end__ is not a registered node", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addEdge("__start__", "a")
      .addEdge("a", "__end__");

    expect(() => graph.validate()).not.toThrow();
  });
});

// ─── requireApproval flag ─────────────────────────────────────────────────────

describe("AgentGraph — requireApproval", () => {
  it("defaults requireApproval to undefined (falsy)", () => {
    const graph = new AgentGraph().addNode("a", makeNode());
    expect(graph.nodes.get("a")!.requireApproval).toBeFalsy();
  });

  it("stores requireApproval: true correctly", () => {
    const graph = new AgentGraph().addNode(
      "sensitive",
      makeNode({ requireApproval: true }),
    );
    expect(graph.nodes.get("sensitive")!.requireApproval).toBe(true);
  });

  it("only the marked node has requireApproval; siblings do not", () => {
    const graph = new AgentGraph()
      .addNode("step1", makeNode())
      .addNode("step2", makeNode({ requireApproval: true }))
      .addNode("step3", makeNode());

    expect(graph.nodes.get("step1")!.requireApproval).toBeFalsy();
    expect(graph.nodes.get("step2")!.requireApproval).toBe(true);
    expect(graph.nodes.get("step3")!.requireApproval).toBeFalsy();
  });
});

// ─── extractContext ───────────────────────────────────────────────────────────

describe("AgentGraph — extractContext", () => {
  it("extractContext is called with node output text", () => {
    const extract = vi.fn(() => ({ score: 42 }));
    const graph = new AgentGraph().addNode(
      "evaluate",
      makeNode({ extractContext: extract }),
    );

    const config = graph.nodes.get("evaluate")!;
    const result = config.extractContext!({ text: "The score is high." });

    expect(extract).toHaveBeenCalledWith({ text: "The score is high." });
    expect(result).toEqual({ score: 42 });
  });

  it("extractContext return value can be used in a conditional router", () => {
    const extract = (output: { text: string }) => ({
      sentiment: output.text.includes("good") ? "positive" : "negative",
    });

    const graph = new AgentGraph()
      .addNode("analyze", makeNode({ extractContext: extract }))
      .addNode("celebrate", makeNode())
      .addNode("rethink", makeNode())
      .addEdge("__start__", "analyze")
      .addConditionalEdges("analyze", (ctx) =>
        ctx.sentiment === "positive" ? "celebrate" : "rethink",
      )
      .addEdge("celebrate", "__end__")
      .addEdge("rethink", "__end__");

    // Simulate the caller merging extracted context before routing
    const config = graph.nodes.get("analyze")!;
    const extracted = config.extractContext!({
      text: "This looks good to me.",
    });
    const ctx = { ...extracted };

    expect(graph.nextNode("analyze", ctx)).toBe("celebrate");
  });

  it("extractContext returning empty object does not break routing", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode({ extractContext: () => ({}) }))
      .addEdge("__start__", "a")
      .addEdge("a", "__end__");

    const config = graph.nodes.get("a")!;
    const result = config.extractContext!({ text: "anything" });
    expect(result).toEqual({});
    expect(graph.nextNode("a", result)).toBe("__end__");
  });
});

// ─── model + system overrides ─────────────────────────────────────────────────

describe("AgentGraph — per-node model/system overrides", () => {
  it("stores a model override on the node", () => {
    const graph = new AgentGraph().addNode(
      "node",
      makeNode({ model: "gpt-4o" }),
    );
    expect(graph.nodes.get("node")!.model).toBe("gpt-4o");
  });

  it("node without model override has undefined model", () => {
    const graph = new AgentGraph().addNode("node", makeNode());
    expect(graph.nodes.get("node")!.model).toBeUndefined();
  });

  it("node with system override stores it", () => {
    const graph = new AgentGraph().addNode(
      "coder",
      makeNode({ system: "You write TypeScript code." }),
    );
    expect(graph.nodes.get("coder")!.system).toBe("You write TypeScript code.");
  });

  it("multiple nodes can have different system prompts", () => {
    const graph = new AgentGraph()
      .addNode("researcher", makeNode({ system: "Research thoroughly." }))
      .addNode("writer", makeNode({ system: "Write concisely." }));

    expect(graph.nodes.get("researcher")!.system).toBe("Research thoroughly.");
    expect(graph.nodes.get("writer")!.system).toBe("Write concisely.");
  });
});

// ─── Edge / routing invariants ────────────────────────────────────────────────

describe("AgentGraph — edge invariants", () => {
  it("a node can have at most one outgoing edge (static → conditional blocked)", () => {
    const graph = new AgentGraph().addNode("a", makeNode()).addEdge("a", "b");

    expect(() => graph.addConditionalEdges("a", () => "__end__")).toThrow(
      /already has a static edge/,
    );
  });

  it("a node can have at most one outgoing edge (conditional → static blocked)", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addConditionalEdges("a", () => "__end__");

    expect(() => graph.addEdge("a", "b")).toThrow(
      /already has a conditional edge/,
    );
  });

  it("__start__ can have a static edge", () => {
    const graph = new AgentGraph()
      .addNode("first", makeNode())
      .addEdge("__start__", "first");

    expect(graph.edges.get("__start__")).toBe("first");
  });

  it("__start__ can have a conditional edge", () => {
    const graph = new AgentGraph()
      .addNode("first", makeNode())
      .addConditionalEdges("__start__", () => "first");

    expect(graph.conditionalEdges.has("__start__")).toBe(true);
  });

  it("different nodes can have edges pointing to the same target", () => {
    const graph = new AgentGraph()
      .addNode("a", makeNode())
      .addNode("b", makeNode())
      .addNode("shared", makeNode())
      .addEdge("__start__", "a")
      .addEdge("a", "shared")
      .addEdge("b", "shared"); // Both a and b point to shared

    expect(graph.edges.get("a")).toBe("shared");
    expect(graph.edges.get("b")).toBe("shared");
  });
});

// ─── AgentStream integration — node-enter/node-exit events ────────────────────

import { AgentStream, type AgentStreamEvent } from "../src/agent-stream";

async function collectEvents(response: Response): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of AgentStream.consume(response)) {
    events.push(event);
  }
  return events;
}

describe("AgentStream — node-enter / node-exit events", () => {
  it("encodeEvent produces valid NDJSON for node-enter", () => {
    const bytes = AgentStream.encodeEvent({
      type: "node-enter",
      node: "search",
    });
    const decoded = new TextDecoder().decode(bytes);
    expect(JSON.parse(decoded.trim())).toEqual({
      type: "node-enter",
      node: "search",
    });
  });

  it("encodeEvent produces valid NDJSON for node-exit", () => {
    const bytes = AgentStream.encodeEvent({
      type: "node-exit",
      node: "summarize",
    });
    const decoded = new TextDecoder().decode(bytes);
    expect(JSON.parse(decoded.trim())).toEqual({
      type: "node-exit",
      node: "summarize",
    });
  });

  it("consume() yields node-enter and node-exit events in order", async () => {
    const lines = [
      JSON.stringify({ type: "node-enter", node: "search" }),
      JSON.stringify({ type: "text-delta", text: "Searching..." }),
      JSON.stringify({ type: "node-exit", node: "search" }),
      JSON.stringify({ type: "node-enter", node: "summarize" }),
      JSON.stringify({ type: "text-delta", text: "Summary here." }),
      JSON.stringify({ type: "node-exit", node: "summarize" }),
      JSON.stringify({ type: "done" }),
    ].join("\n");

    const response = new Response(lines, {
      headers: { "Content-Type": "application/x-ndjson" },
    });

    const events = await collectEvents(response);

    expect(events).toEqual([
      { type: "node-enter", node: "search" },
      { type: "text-delta", text: "Searching..." },
      { type: "node-exit", node: "search" },
      { type: "node-enter", node: "summarize" },
      { type: "text-delta", text: "Summary here." },
      { type: "node-exit", node: "summarize" },
      { type: "done" },
    ]);
  });

  it("createGraphResponse returns correct NDJSON headers", () => {
    const stream = new ReadableStream<Uint8Array>({ start: (c) => c.close() });
    const response = AgentStream.createGraphResponse(stream);

    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("createGraphResponse round-trips a full graph event sequence", async () => {
    const events: AgentStreamEvent[] = [
      { type: "node-enter", node: "step1" },
      { type: "text-delta", text: "Running step 1..." },
      { type: "node-exit", node: "step1" },
      { type: "node-enter", node: "step2" },
      { type: "text-delta", text: "Running step 2..." },
      { type: "node-exit", node: "step2" },
      { type: "done" },
    ];

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const e of events) {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        }
        controller.close();
      },
    });

    const response = AgentStream.createGraphResponse(readable);
    const received = await collectEvents(response);

    expect(received).toEqual(events);
  });

  it("mapPart still maps standard events correctly (regression guard)", () => {
    expect(AgentStream.mapPart({ type: "text-delta", text: "hello" })).toEqual({
      type: "text-delta",
      text: "hello",
    });
    expect(AgentStream.mapPart({ type: "step-finish", stepNumber: 2 })).toEqual(
      {
        type: "step-finish",
        stepNumber: 2,
      },
    );
    expect(AgentStream.mapPart({ type: "unknown-future-event" })).toBeNull();
  });

  it("mapPart does NOT map node-enter / node-exit (those are emitted by ServerAgent directly)", () => {
    // These aren't AI SDK stream parts — they're graph lifecycle events emitted manually.
    // mapPart should return null for them.
    expect(AgentStream.mapPart({ type: "node-enter", node: "x" })).toBeNull();
    expect(AgentStream.mapPart({ type: "node-exit", node: "x" })).toBeNull();
  });
});

// ─── AgentController — currentNode tracking ───────────────────────────────────

import { AgentController, type AgentCallbacks } from "../src/agent-controller";

function makeCallbacks(): AgentCallbacks & {
  _currentNode: string | null;
} {
  const cb = {
    _currentNode: null as string | null,
    onMessages: vi.fn(),
    onStatus: vi.fn(),
    onError: vi.fn(),
    onPendingApproval: vi.fn(),
    onCurrentNode: vi.fn((node: string | null) => {
      cb._currentNode = node;
    }),
  };
  return cb;
}

function makeNdjsonResponse(events: AgentStreamEvent[]): Response {
  const body = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

describe("AgentController — currentNode tracking", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.clearAllMocks();
  });

  it("currentNode is null initially", () => {
    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      makeCallbacks(),
    );
    expect(ctrl.currentNode).toBeNull();
  });

  it("currentNode updates to node name on node-enter event", async () => {
    fetchMock.mockResolvedValue(
      makeNdjsonResponse([
        { type: "node-enter", node: "search" },
        { type: "text-delta", text: "Searching..." },
        { type: "node-exit", node: "search" },
        { type: "done" },
      ]),
    );

    const cb = makeCallbacks();
    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      cb,
    );

    await ctrl.send("find something");

    expect(cb.onCurrentNode).toHaveBeenCalledWith("search");
    expect(cb.onCurrentNode).toHaveBeenCalledWith(null);
  });

  it("currentNode is null after graph completes (done event)", async () => {
    fetchMock.mockResolvedValue(
      makeNdjsonResponse([
        { type: "node-enter", node: "step1" },
        { type: "node-exit", node: "step1" },
        { type: "done" },
      ]),
    );

    const cb = makeCallbacks();
    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      cb,
    );

    await ctrl.send("run");

    expect(ctrl.currentNode).toBeNull();
  });

  it("onCurrentNode called in order across multiple nodes", async () => {
    fetchMock.mockResolvedValue(
      makeNdjsonResponse([
        { type: "node-enter", node: "fetch" },
        { type: "node-exit", node: "fetch" },
        { type: "node-enter", node: "process" },
        { type: "node-exit", node: "process" },
        { type: "node-enter", node: "store" },
        { type: "node-exit", node: "store" },
        { type: "done" },
      ]),
    );

    const cb = makeCallbacks();
    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      cb,
    );

    await ctrl.send("execute pipeline");

    const nodeArgs = cb.onCurrentNode.mock.calls.map(([node]) => node);
    // node-enter for each node + null at done
    expect(nodeArgs).toEqual(["fetch", "process", "store", null]);
  });

  it("stop() resets currentNode to null and fires onCurrentNode(null)", async () => {
    let resolveStream!: () => void;
    const streamDone = new Promise<void>((res) => {
      resolveStream = res;
    });

    // Build a slow stream that we can abort
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "node-enter", node: "slow" }) + "\n",
          ),
        );
        await streamDone;
        controller.close();
      },
    });

    fetchMock.mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      }),
    );

    const cb = makeCallbacks();
    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      cb,
    );

    const sendPromise = ctrl.send("run slow task");

    // Wait for node-enter to be processed
    await new Promise((r) => setTimeout(r, 10));

    // Abort mid-stream
    ctrl.stop();
    resolveStream();

    await sendPromise;

    // After stop(), currentNode must be null and onCurrentNode(null) called
    expect(ctrl.currentNode).toBeNull();
    const lastCall =
      cb.onCurrentNode.mock.calls[cb.onCurrentNode.mock.calls.length - 1];
    expect(lastCall?.[0]).toBeNull();
  });

  it("creates one assistant message per node", async () => {
    fetchMock.mockResolvedValue(
      makeNdjsonResponse([
        { type: "node-enter", node: "step1" },
        { type: "text-delta", text: "Step 1 output." },
        { type: "node-exit", node: "step1" },
        { type: "node-enter", node: "step2" },
        { type: "text-delta", text: "Step 2 output." },
        { type: "node-exit", node: "step2" },
        { type: "done" },
      ]),
    );

    const cb = makeCallbacks();
    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      cb,
    );

    await ctrl.send("run");

    // messages: [user, assistant(step1), assistant(step2)]
    const messages = ctrl.messages;
    const assistants = messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(2);
    expect(assistants[0]!.content).toBe("Step 1 output.");
    expect(assistants[1]!.content).toBe("Step 2 output.");
  });

  it("tool-call events in graph stream are inserted before the current node's assistant message", async () => {
    fetchMock.mockResolvedValue(
      makeNdjsonResponse([
        { type: "node-enter", node: "search" },
        {
          type: "tool-call",
          toolCallId: "tc_1",
          toolName: "web_search",
          args: { query: "AI news" },
        },
        {
          type: "tool-result",
          toolCallId: "tc_1",
          toolName: "web_search",
          result: { results: [] },
        },
        { type: "text-delta", text: "Found results." },
        { type: "node-exit", node: "search" },
        { type: "done" },
      ]),
    );

    const cb = makeCallbacks();
    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      cb,
    );

    await ctrl.send("search");

    const messages = ctrl.messages;
    // Should be: user, tool(web_search), assistant(search-node)
    expect(messages[1]!.type).toBe("tool-call");
    expect(messages[1]!.toolName).toBe("web_search");
    expect(messages[1]!.toolStatus).toBe("completed");
    expect(messages[2]!.role).toBe("assistant");
    expect(messages[2]!.content).toBe("Found results.");
  });

  it("falls back to plain-text consumption for non-NDJSON responses (backward compat)", async () => {
    fetchMock.mockResolvedValue(
      new Response("Hello from a plain text agent", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const cb = makeCallbacks();
    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      cb,
    );

    await ctrl.send("hi");

    const assistants = ctrl.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]!.content).toBe("Hello from a plain text agent");
    // onCurrentNode should never have been called (plain text has no graph events)
    expect(cb.onCurrentNode).not.toHaveBeenCalled();
  });

  it("approval-request event pauses status to awaiting-approval", async () => {
    fetchMock.mockResolvedValue(
      makeNdjsonResponse([
        { type: "node-enter", node: "review" },
        { type: "text-delta", text: "Reviewed." },
        { type: "node-exit", node: "review" },
        {
          type: "approval-request",
          approvalId: "ap_1",
          toolCallId: "",
          toolName: "review",
          args: { node: "review", output: "Reviewed." },
        },
        { type: "done" },
      ]),
    );

    const cb = makeCallbacks();
    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      cb,
    );

    await ctrl.send("review this");

    expect(cb.onStatus).toHaveBeenCalledWith("awaiting-approval");
    expect(cb.onPendingApproval).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ap_1", toolName: "review" }),
    );
  });
});
