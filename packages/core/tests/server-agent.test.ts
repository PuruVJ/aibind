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

describe("ServerAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if no model provided", () => {
    expect(() => new ServerAgent({ system: "You are helpful." })).toThrow(
      "model is required",
    );
  });

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

  it("stream() calls streamText", () => {
    mockStreamText.mockReturnValue({ textStream: [] } as never);

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

  it("passes tools to AI SDK", async () => {
    mockGenerateText.mockResolvedValue({ text: "done" } as never);

    const tools = {
      search: {
        description: "Search the web",
        parameters: { type: "object" as const },
        execute: vi.fn(),
      },
    };

    const agent = new ServerAgent({
      model: "test-model",
      system: "Be helpful",
      tools: tools as never,
    });

    await agent.run("search for svelte");

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: tools,
      }),
    );
  });

  it("uses stopWhen with stepCountIs", async () => {
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

  it("stream() builds messages from history", () => {
    mockStreamText.mockReturnValue({ textStream: [] } as never);

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
});
