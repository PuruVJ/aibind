import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  stepCountIs: vi.fn((n: number) => ({ type: "stepCount", count: n })),
}));

import { ServerAgent } from "../src/server-agent.js";
import { generateText, streamText } from "ai";

const mockGenerateText = vi.mocked(generateText);
const mockStreamText = vi.mocked(streamText);

// Fake AI SDK streamText result with toTextStreamResponse()
function makeStreamResult(text = "response"): any {
  return {
    textStream: (async function* () {
      yield text;
    })(),
    toTextStreamResponse: () =>
      new Response(text, {
        headers: { "Content-Type": "text/plain" },
      }),
  };
}

describe("ServerAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- constructor ---

  it("throws if no model provided", () => {
    expect(() => new ServerAgent({ system: "You are helpful." })).toThrow(
      "model is required",
    );
  });

  // --- run() ---

  it("run() calls generateText", async () => {
    mockGenerateText.mockResolvedValue({ text: "response" } as never);

    const agent = new ServerAgent({
      model: "test-model",
      system: "Be helpful",
      stopWhen: { type: "stepCount", count: 3 } as never,
    });

    await agent.run("hello");

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        system: "Be helpful",
        prompt: "hello",
      }),
    );
  });

  // --- stream() ---

  it("stream() calls streamText", () => {
    mockStreamText.mockReturnValue(makeStreamResult() as never);

    const agent = new ServerAgent({
      model: "test-model",
      system: "Be helpful",
    });

    agent.stream("hello");

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        prompt: "hello",
      }),
    );
  });

  // --- stopWhen ---

  it("uses default stopWhen of stepCountIs(10)", async () => {
    mockGenerateText.mockResolvedValue({ text: "response" } as never);

    const agent = new ServerAgent({
      model: "test-model",
      system: "Be helpful",
    });

    await agent.run("hello");

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        stopWhen: { type: "stepCount", count: 10 },
      }),
    );
  });

  it("custom stopWhen is passed through", async () => {
    mockGenerateText.mockResolvedValue({ text: "response" } as never);

    const customStop = { type: "custom", value: 42 };
    const agent = new ServerAgent({
      model: "test-model",
      system: "Be helpful",
      stopWhen: customStop as never,
    });

    await agent.run("hello");

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        stopWhen: customStop,
      }),
    );
  });

  // --- message history ---

  it("stream() builds messages from history", () => {
    mockStreamText.mockReturnValue(makeStreamResult() as never);

    const agent = new ServerAgent({
      model: "test-model",
      system: "Be helpful",
    });

    agent.stream("follow up", {
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ],
    });

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi there" },
          { role: "user", content: "follow up" },
        ],
      }),
    );
  });

  it("run() with message history builds messages correctly", async () => {
    mockGenerateText.mockResolvedValue({ text: "response" } as never);

    const agent = new ServerAgent({
      model: "test-model",
      system: "Be helpful",
    });

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

  it("run() with empty messages uses prompt directly", async () => {
    mockGenerateText.mockResolvedValue({ text: "response" } as never);

    const agent = new ServerAgent({
      model: "test-model",
      system: "Be helpful",
    });

    await agent.run("hello", { messages: [] });

    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.prompt).toBe("hello");
    expect(call.messages).toBeUndefined();
  });

  it("run() propagates generateText errors", async () => {
    mockGenerateText.mockRejectedValue(new Error("API down"));

    const agent = new ServerAgent({
      model: "test-model",
      system: "Be helpful",
    });

    await expect(agent.run("hello")).rejects.toThrow("API down");
  });

  // --- toolsets ---

  describe("toolsets", () => {
    const tools = {
      get_weather: { description: "Get weather", execute: vi.fn() },
      get_time: { description: "Get time", execute: vi.fn() },
    };
    const toolsets = {
      assistant: tools,
      billing: { get_invoice: { description: "Invoice", execute: vi.fn() } },
    };

    it("uses server-default toolset when none specified in RunOptions", async () => {
      mockGenerateText.mockResolvedValue({ text: "done" } as never);

      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
        toolsets,
        toolset: "assistant",
      });

      await agent.run("hello");

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({ tools: tools }),
      );
    });

    it("RunOptions.toolset overrides server-default", async () => {
      mockGenerateText.mockResolvedValue({ text: "done" } as never);

      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
        toolsets,
        toolset: "assistant", // default
      });

      await agent.run("hello", { toolset: "billing" }); // override

      const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
      expect((call.tools as any).get_invoice).toBeDefined();
      expect((call.tools as any).get_weather).toBeUndefined();
    });

    it("stream() RunOptions.toolset overrides default", () => {
      mockStreamText.mockReturnValue(makeStreamResult() as never);

      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
        toolsets,
        toolset: "assistant",
      });

      agent.stream("hello", { toolset: "billing" });

      const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
      expect((call.tools as any).get_invoice).toBeDefined();
      expect((call.tools as any).get_weather).toBeUndefined();
    });

    it("unknown toolset key → no tools passed", async () => {
      mockGenerateText.mockResolvedValue({ text: "done" } as never);

      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
        toolsets,
      });

      await agent.run("hello", { toolset: "nonexistent" });

      const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
      expect(call.tools).toBeUndefined();
    });

    it("no toolset specified and no config default → no tools passed", async () => {
      mockGenerateText.mockResolvedValue({ text: "done" } as never);

      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
        toolsets,
        // no toolset default
      });

      await agent.run("hello");

      const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
      expect(call.tools).toBeUndefined();
    });

    it("no toolsets config → no tools regardless of requested key", async () => {
      mockGenerateText.mockResolvedValue({ text: "done" } as never);

      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
        // no toolsets at all
      });

      await agent.run("hello", { toolset: "assistant" });

      const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
      expect(call.tools).toBeUndefined();
    });

    it("does not include tools key when no toolset active (clean call)", async () => {
      mockGenerateText.mockResolvedValue({ text: "done" } as never);

      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
      });
      await agent.run("hello");

      const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
      expect("tools" in call).toBe(false);
    });
  });

  // --- handle() ---

  describe("handle()", () => {
    function makeRequest(body: object): Request {
      return new Request("http://localhost/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("reads messages from body and calls stream()", async () => {
      mockStreamText.mockReturnValue(makeStreamResult("hi back") as never);

      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
      });
      const req = makeRequest({
        messages: [{ role: "user", content: "hello" }],
      });

      const resp = await agent.handle(req);

      expect(resp).toBeInstanceOf(Response);
      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "hello" }),
      );
    });

    it("uses server-default toolset when body has no toolset", async () => {
      mockStreamText.mockReturnValue(makeStreamResult() as never);

      const tools = { search: { description: "search", execute: vi.fn() } };
      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
        toolsets: { web: tools },
        toolset: "web",
      });

      await agent.handle(
        makeRequest({ messages: [{ role: "user", content: "hi" }] }),
      );

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({ tools: tools }),
      );
    });

    it("uses toolset from body, overriding server default", async () => {
      mockStreamText.mockReturnValue(makeStreamResult() as never);

      const webTools = { search: { description: "search", execute: vi.fn() } };
      const billingTools = {
        invoice: { description: "invoice", execute: vi.fn() },
      };
      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
        toolsets: { web: webTools, billing: billingTools },
        toolset: "web", // server default
      });

      await agent.handle(
        makeRequest({
          messages: [{ role: "user", content: "get invoice" }],
          toolset: "billing", // client override
        }),
      );

      const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
      expect((call.tools as any).invoice).toBeDefined();
      expect((call.tools as any).search).toBeUndefined();
    });

    it("unknown toolset in body → no tools", async () => {
      mockStreamText.mockReturnValue(makeStreamResult() as never);

      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
        toolsets: { web: { search: { description: "s", execute: vi.fn() } } },
      });

      await agent.handle(
        makeRequest({
          messages: [{ role: "user", content: "hi" }],
          toolset: "doesnotexist",
        }),
      );

      const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
      expect(call.tools).toBeUndefined();
    });

    it("passes message history correctly — last message is prompt, rest are history", async () => {
      mockStreamText.mockReturnValue(makeStreamResult() as never);

      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
      });
      await agent.handle(
        makeRequest({
          messages: [
            { role: "user", content: "hello" },
            { role: "assistant", content: "hi" },
            { role: "user", content: "follow up" },
          ],
        }),
      );

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: "user", content: "hello" },
            { role: "assistant", content: "hi" },
            { role: "user", content: "follow up" },
          ],
        }),
      );
    });

    it("single message → uses prompt directly (no messages key)", async () => {
      mockStreamText.mockReturnValue(makeStreamResult() as never);

      const agent = new ServerAgent({
        model: "test-model",
        system: "Be helpful",
      });
      await agent.handle(
        makeRequest({
          messages: [{ role: "user", content: "hello" }],
        }),
      );

      const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
      expect(call.prompt).toBe("hello");
      expect(call.messages).toBeUndefined();
    });
  });
});

// --- AgentController toolset wiring ---

import {
  AgentController,
  type AgentCallbacks,
} from "../src/agent-controller.js";

function makeCallbacks(): AgentCallbacks {
  return {
    onMessages: vi.fn(),
    onStatus: vi.fn(),
    onError: vi.fn(),
    onPendingApproval: vi.fn(),
  };
}

function makeTextResponse(text: string): Response {
  return new Response(new TextEncoder().encode(text), { status: 200 });
}

describe("AgentController — toolset wiring", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.clearAllMocks();
  });

  it("includes toolset in request body when set", async () => {
    fetchMock.mockResolvedValue(makeTextResponse("reply"));

    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock, toolset: "research" },
      makeCallbacks(),
    );
    await ctrl.send("search for something");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.toolset).toBe("research");
  });

  it("does NOT include toolset key when option is not set", async () => {
    fetchMock.mockResolvedValue(makeTextResponse("reply"));

    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock },
      makeCallbacks(),
    );
    await ctrl.send("hello");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect("toolset" in body).toBe(false);
  });

  it("sends toolset on every request in a multi-turn conversation", async () => {
    fetchMock
      .mockResolvedValueOnce(makeTextResponse("first"))
      .mockResolvedValueOnce(makeTextResponse("second"));

    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock, toolset: "billing" },
      makeCallbacks(),
    );

    await ctrl.send("first");
    await ctrl.send("second");

    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(call[1].body);
      expect(body.toolset).toBe("billing");
    }
  });

  it("two instances with different toolsets send their respective toolsets", async () => {
    fetchMock.mockResolvedValue(makeTextResponse("ok"));

    const cb = makeCallbacks();
    const research = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock, toolset: "research" },
      cb,
    );
    const billing = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock, toolset: "billing" },
      cb,
    );

    await research.send("search");
    await billing.send("invoice");

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(firstBody.toolset).toBe("research");
    expect(secondBody.toolset).toBe("billing");
  });

  it("toolset is separate from messages in the body", async () => {
    fetchMock.mockResolvedValue(makeTextResponse("ok"));

    const ctrl = new AgentController(
      { endpoint: "/api/agent", fetch: fetchMock, toolset: "assistant" },
      makeCallbacks(),
    );
    await ctrl.send("hello");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toBeDefined();
    expect(body.toolset).toBe("assistant");
    expect(Array.isArray(body.messages)).toBe(true);
  });
});
