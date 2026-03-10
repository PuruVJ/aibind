import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  jsonSchema: vi.fn((s: unknown) => s),
  stepCountIs: vi.fn((n: number) => ({ type: "stepCount", count: n })),
}));

import { ServerAgent } from "../src/server-agent.js";
import { AgentGraph } from "../src/agent-graph.js";
import {
  AgentController,
  type AgentCallbacks,
} from "../src/agent-controller.js";
import { generateText, streamText } from "ai";

const mockGenerateText = vi.mocked(generateText);
const mockStreamText = vi.mocked(streamText);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStreamResult(
  parts: Array<{ type: string; [k: string]: unknown }> = [],
): any {
  return {
    textStream: (async function* () {
      for (const p of parts) {
        if (p.type === "text-delta") yield p.text as string;
      }
    })(),
    fullStream: (async function* () {
      for (const p of parts) yield p;
    })(),
    toTextStreamResponse: () =>
      new Response("response", {
        headers: { "Content-Type": "text/plain" },
      }),
  };
}

function makeRequest(body: object): Request {
  return new Request("http://localhost/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCallbacks(): AgentCallbacks {
  return {
    onMessages: vi.fn(),
    onStatus: vi.fn(),
    onError: vi.fn(),
    onPendingApproval: vi.fn(),
    onCurrentNode: vi.fn(),
  };
}

// ─── Constructor ──────────────────────────────────────────────────────────────

describe("ServerAgent — constructor", () => {
  it("throws if no model provided", () => {
    expect(
      () => new ServerAgent({ system: "You are helpful." } as any),
    ).toThrow("model is required");
  });

  it("constructs without error when model is provided", () => {
    expect(
      () => new ServerAgent({ model: "test-model", system: "Be helpful." }),
    ).not.toThrow();
  });
});

// ─── Extends AgentGraph ───────────────────────────────────────────────────────

describe("ServerAgent — extends AgentGraph", () => {
  it("is an instance of AgentGraph", () => {
    const agent = new ServerAgent({ model: "m", system: "s" });
    expect(agent).toBeInstanceOf(AgentGraph);
  });

  it("addNode / addEdge are inherited and fluent", () => {
    const agent = new ServerAgent({ model: "m", system: "s" });
    const result = agent
      .addNode("step1", { system: "Do step 1." })
      .addNode("step2", { system: "Do step 2." })
      .addEdge("__start__", "step1")
      .addEdge("step1", "step2")
      .addEdge("step2", "__end__");

    expect(result).toBe(agent);
    expect(agent.nodes.has("step1")).toBe(true);
    expect(agent.nodes.has("step2")).toBe(true);
    expect(agent.edges.get("__start__")).toBe("step1");
  });

  it("addConditionalEdges is inherited", () => {
    const router = vi.fn(() => "__end__");
    const agent = new ServerAgent({ model: "m", system: "s" })
      .addNode("check", { system: "Check things." })
      .addEdge("__start__", "check")
      .addConditionalEdges("check", router);

    expect(agent.conditionalEdges.has("check")).toBe(true);
  });
});

// ─── use(graph) ───────────────────────────────────────────────────────────────

describe("ServerAgent.use()", () => {
  it("imports nodes and edges from a shared AgentGraph", () => {
    const shared = new AgentGraph()
      .addNode("research", { system: "Research." })
      .addEdge("__start__", "research")
      .addEdge("research", "__end__");

    const agent = new ServerAgent({ model: "m", system: "s" }).use(shared);

    expect(agent.nodes.has("research")).toBe(true);
    expect(agent.edges.get("__start__")).toBe("research");
    expect(agent.edges.get("research")).toBe("__end__");
  });

  it("is chainable — returns the same agent", () => {
    const shared = new AgentGraph()
      .addNode("a", { system: "A." })
      .addEdge("__start__", "a")
      .addEdge("a", "__end__");

    const agent = new ServerAgent({ model: "m", system: "s" });
    expect(agent.use(shared)).toBe(agent);
  });

  it("can extend imported graph with additional nodes", () => {
    const shared = new AgentGraph()
      .addNode("fetch", { system: "Fetch data." })
      .addEdge("__start__", "fetch");

    const agent = new ServerAgent({ model: "m", system: "s" })
      .use(shared)
      .addNode("process", { system: "Process data." })
      .addEdge("fetch", "process")
      .addEdge("process", "__end__");

    expect(agent.nodes.has("fetch")).toBe(true);
    expect(agent.nodes.has("process")).toBe(true);
  });

  it("two agents sharing the same graph are independent", () => {
    const shared = new AgentGraph()
      .addNode("run", { system: "Run." })
      .addEdge("__start__", "run")
      .addEdge("run", "__end__");

    const fast = new ServerAgent({ model: "fast-model", system: "Fast." }).use(
      shared,
    );
    const deep = new ServerAgent({ model: "deep-model", system: "Deep." }).use(
      shared,
    );

    // Adding a node to fast should not affect deep
    fast.addNode("extra", { system: "Extra." });
    expect(fast.nodes.has("extra")).toBe(true);
    expect(deep.nodes.has("extra")).toBe(false);
  });
});

// ─── run() ────────────────────────────────────────────────────────────────────

describe("ServerAgent.run()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls generateText with model and system", async () => {
    mockGenerateText.mockResolvedValue({ text: "response" } as never);

    const agent = new ServerAgent({
      model: "test-model",
      system: "Be helpful.",
    });
    await agent.run("hello");

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        system: "Be helpful.",
        prompt: "hello",
      }),
    );
  });

  it("builds message history when provided", async () => {
    mockGenerateText.mockResolvedValue({ text: "response" } as never);

    const agent = new ServerAgent({ model: "m", system: "s" });
    await agent.run("follow up", {
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ],
    });

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi there" },
          { role: "user", content: "follow up" },
        ],
      }),
    );
  });

  it("uses prompt directly when messages array is empty", async () => {
    mockGenerateText.mockResolvedValue({ text: "response" } as never);

    const agent = new ServerAgent({ model: "m", system: "s" });
    await agent.run("hello", { messages: [] });

    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.prompt).toBe("hello");
    expect(call.messages).toBeUndefined();
  });

  it("propagates errors from generateText", async () => {
    mockGenerateText.mockRejectedValue(new Error("API down"));

    const agent = new ServerAgent({ model: "m", system: "s" });
    await expect(agent.run("hello")).rejects.toThrow("API down");
  });

  it("does not pass tools to generateText", async () => {
    mockGenerateText.mockResolvedValue({ text: "response" } as never);

    const agent = new ServerAgent({ model: "m", system: "s" })
      .addNode("step", { tools: { search: {} as any }, system: "Search." })
      .addEdge("__start__", "step")
      .addEdge("step", "__end__");

    await agent.run("hello");

    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect("tools" in call).toBe(false);
  });
});

// ─── stream() ─────────────────────────────────────────────────────────────────

describe("ServerAgent.stream()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls streamText with model and system", () => {
    mockStreamText.mockReturnValue(makeStreamResult() as never);

    const agent = new ServerAgent({
      model: "test-model",
      system: "Be helpful.",
    });
    agent.stream("hello");

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        system: "Be helpful.",
        prompt: "hello",
      }),
    );
  });

  it("builds messages array when history provided", () => {
    mockStreamText.mockReturnValue(makeStreamResult() as never);

    const agent = new ServerAgent({ model: "m", system: "s" });
    agent.stream("follow up", {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    });

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
          { role: "user", content: "follow up" },
        ],
      }),
    );
  });

  it("does not pass tools to streamText", () => {
    mockStreamText.mockReturnValue(makeStreamResult() as never);

    const agent = new ServerAgent({ model: "m", system: "s" });
    agent.stream("hello");

    const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
    expect("tools" in call).toBe(false);
  });
});

// ─── asTool() ─────────────────────────────────────────────────────────────────

describe("ServerAgent.asTool()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a tool with the given description", () => {
    const agent = new ServerAgent({ model: "m", system: "s" });
    const tool = agent.asTool("Do some research");
    expect(tool.description).toBe("Do some research");
  });

  it("tool.execute calls run() and returns text", async () => {
    mockGenerateText.mockResolvedValue({ text: "research result" } as never);

    const agent = new ServerAgent({ model: "m", system: "s" });
    const tool = agent.asTool("Research something");

    const result = await (tool as any).execute({ prompt: "quantum computing" });
    expect(result).toBe("research result");
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "quantum computing" }),
    );
  });

  it("tool has a prompt inputSchema", () => {
    const agent = new ServerAgent({ model: "m", system: "s" });
    const tool = agent.asTool("Research") as any;
    expect(tool.inputSchema).toBeDefined();
  });
});

// ─── handle() — graph execution ───────────────────────────────────────────────

describe("ServerAgent.handle()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns NDJSON response with node-enter, text-delta, node-exit, done", async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([{ type: "text-delta", text: "Searching..." }]) as never,
    );

    const agent = new ServerAgent({ model: "m", system: "Research assistant." })
      .addNode("search", { system: "Search." })
      .addEdge("__start__", "search")
      .addEdge("search", "__end__");

    const req = makeRequest({
      messages: [{ role: "user", content: "find info" }],
    });
    const resp = await agent.handle(req);

    expect(resp.headers.get("Content-Type")).toBe("application/x-ndjson");

    const text = await resp.text();
    const lines = text
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

    expect(lines[0]).toEqual({ type: "node-enter", node: "search" });
    expect(
      lines.some(
        (e: any) => e.type === "text-delta" && e.text === "Searching...",
      ),
    ).toBe(true);
    expect(
      lines.some((e: any) => e.type === "node-exit" && e.node === "search"),
    ).toBe(true);
    expect(lines[lines.length - 1]).toEqual({ type: "done" });
  });

  it("executes nodes in order — linear chain", async () => {
    mockStreamText
      .mockReturnValueOnce(
        makeStreamResult([
          { type: "text-delta", text: "Node A output" },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeStreamResult([
          { type: "text-delta", text: "Node B output" },
        ]) as never,
      );

    const agent = new ServerAgent({ model: "m", system: "s" })
      .addNode("a", { system: "Node A." })
      .addNode("b", { system: "Node B." })
      .addEdge("__start__", "a")
      .addEdge("a", "b")
      .addEdge("b", "__end__");

    const req = makeRequest({ messages: [{ role: "user", content: "go" }] });
    const resp = await agent.handle(req);
    const lines = (await resp.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

    const nodeEnters = lines
      .filter((e: any) => e.type === "node-enter")
      .map((e: any) => e.node);
    expect(nodeEnters).toEqual(["a", "b"]);
  });

  it("passes accumulated history to each node — second node receives first node's output", async () => {
    const capturedCalls: any[] = [];
    mockStreamText.mockImplementation((...args: any[]) => {
      capturedCalls.push(args[0]);
      return makeStreamResult(
        capturedCalls.length === 1
          ? [{ type: "text-delta", text: "First node response" }]
          : [],
      ) as never;
    });

    const agent = new ServerAgent({ model: "m", system: "s" })
      .addNode("step1", { system: "Step 1." })
      .addNode("step2", { system: "Step 2." })
      .addEdge("__start__", "step1")
      .addEdge("step1", "step2")
      .addEdge("step2", "__end__");

    const req = makeRequest({ messages: [{ role: "user", content: "start" }] });
    // Must consume the response body — the stream is lazy and won't run until read
    await (await agent.handle(req)).text();

    expect(capturedCalls).toHaveLength(2);
    const secondCallMessages = capturedCalls[1].messages;
    const lastMsg = secondCallMessages[secondCallMessages.length - 1];
    expect(lastMsg).toEqual({
      role: "assistant",
      content: "First node response",
    });
  });

  it("emits error event when node is not registered", async () => {
    // Force nextNode to return a non-existent node
    const agent = new ServerAgent({ model: "m", system: "s" });
    // Inject a __start__ edge to a nonexistent node directly
    agent.edges.set("__start__", "nonexistent");

    const req = makeRequest({ messages: [{ role: "user", content: "run" }] });
    const resp = await agent.handle(req);
    const lines = (await resp.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

    const errorEvent = lines.find((e: any) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent.error).toMatch(/nonexistent/);
    expect(lines[lines.length - 1]).toEqual({ type: "done" });
  });

  it("emits approval-request event for requireApproval nodes", async () => {
    mockStreamText.mockReturnValue(
      makeStreamResult([{ type: "text-delta", text: "Plan done." }]) as never,
    );

    const agent = new ServerAgent({ model: "m", system: "s" })
      .addNode("plan", { system: "Plan.", requireApproval: true })
      .addEdge("__start__", "plan")
      .addEdge("plan", "__end__");

    const req = makeRequest({ messages: [{ role: "user", content: "run" }] });
    const resp = await agent.handle(req);
    const lines = (await resp.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

    const approval = lines.find((e: any) => e.type === "approval-request");
    expect(approval).toBeDefined();
    expect(approval.toolName).toBe("plan");
    expect(typeof approval.approvalId).toBe("string");
  });

  it("uses per-node system when specified", async () => {
    mockStreamText.mockReturnValue(makeStreamResult() as never);

    const agent = new ServerAgent({ model: "m", system: "Default system." })
      .addNode("specialized", { system: "Specialized system." })
      .addEdge("__start__", "specialized")
      .addEdge("specialized", "__end__");

    const req = makeRequest({ messages: [{ role: "user", content: "hi" }] });
    await agent.handle(req);

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ system: "Specialized system." }),
    );
  });

  it("falls back to agent system when node has no system override", async () => {
    mockStreamText.mockReturnValue(makeStreamResult() as never);

    const agent = new ServerAgent({ model: "m", system: "Agent system." })
      .addNode("plain", {})
      .addEdge("__start__", "plain")
      .addEdge("plain", "__end__");

    const req = makeRequest({ messages: [{ role: "user", content: "hi" }] });
    await agent.handle(req);

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ system: "Agent system." }),
    );
  });

  it("passes node tools to streamText", async () => {
    const nodeTools = { search: { description: "search", execute: vi.fn() } };
    mockStreamText.mockReturnValue(makeStreamResult() as never);

    const agent = new ServerAgent({ model: "m", system: "s" })
      .addNode("tooled", { tools: nodeTools as any, system: "Use tools." })
      .addEdge("__start__", "tooled")
      .addEdge("tooled", "__end__");

    const req = makeRequest({
      messages: [{ role: "user", content: "search" }],
    });
    await agent.handle(req);

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ tools: nodeTools }),
    );
  });

  it("conditional routing via extractContext", async () => {
    mockStreamText
      .mockReturnValueOnce(
        makeStreamResult([
          { type: "text-delta", text: "FOUND results" },
        ]) as never,
      )
      .mockReturnValueOnce(
        makeStreamResult([
          { type: "text-delta", text: "Summary done." },
        ]) as never,
      );

    const agent = new ServerAgent({ model: "m", system: "s" })
      .addNode("search", {
        system: "Search.",
        extractContext: ({ text }) => ({ hasResults: text.includes("FOUND") }),
      })
      .addNode("summarize", { system: "Summarize." })
      .addNode("fallback", { system: "Fallback." })
      .addEdge("__start__", "search")
      .addConditionalEdges("search", (ctx) =>
        ctx.hasResults ? "summarize" : "fallback",
      )
      .addEdge("summarize", "__end__")
      .addEdge("fallback", "__end__");

    const req = makeRequest({ messages: [{ role: "user", content: "find" }] });
    const resp = await agent.handle(req);
    const lines = (await resp.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

    const nodeEnters = lines
      .filter((e: any) => e.type === "node-enter")
      .map((e: any) => e.node);
    expect(nodeEnters).toEqual(["search", "summarize"]);
  });
});

// ─── AgentController — no toolset in request body ─────────────────────────────

describe("AgentController — request body", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.clearAllMocks();
  });

  function makeTextResponse(text: string): Response {
    return new Response(new TextEncoder().encode(text), { status: 200 });
  }

  it("does NOT include toolset in request body", async () => {
    fetchMock.mockResolvedValue(makeTextResponse("reply"));

    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      makeCallbacks(),
    );
    await ctrl.send("hello");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect("toolset" in body).toBe(false);
  });

  it("sends only messages in the request body", async () => {
    fetchMock.mockResolvedValue(makeTextResponse("reply"));

    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      makeCallbacks(),
    );
    await ctrl.send("hello");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Object.keys(body)).toEqual(["messages"]);
  });
});
