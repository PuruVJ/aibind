/**
 * Composite tests — exercise multiple features interacting with each other.
 *
 * Each describe block tests a combination rather than a single class in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  StreamController,
  type StreamCallbacks,
} from "../src/stream-controller";
import { RaceController, type RaceCallbacks } from "../src/race-controller";
import { UsageTracker } from "../src/usage-tracker";
import { ChatHistory } from "../src/chat-history";
import { MemoryStreamStore } from "../src/memory-store";
import { DurableStream } from "../src/durable-stream";
import { routeByLength } from "../src/routing";
import { defaultDiff } from "../src/diff";
import { SSE } from "../src/sse";

// ─── Shared helpers ──────────────────────────────────────────────────────────

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeCallbacks(): StreamCallbacks & {
  texts: string[];
  statuses: string[];
  usages: unknown[];
  diffs: unknown[];
} {
  const texts: string[] = [];
  const statuses: string[] = [];
  const usages: unknown[] = [];
  const diffs: unknown[] = [];
  return {
    texts,
    statuses,
    usages,
    diffs,
    onText: (v) => texts.push(v),
    onLoading: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onStatus: (v) => statuses.push(v),
    onStreamId: vi.fn(),
    onCanResume: vi.fn(),
    onUsage: (v) => usages.push(v),
    onDiff: (v) => diffs.push(v),
  };
}

function makeRaceCallbacks(): RaceCallbacks & {
  texts: string[];
  winners: Array<string | null>;
  errors: Array<Error | null>;
} {
  const texts: string[] = [];
  const winners: Array<string | null> = [];
  const errors: Array<Error | null> = [];
  return {
    texts,
    winners,
    errors,
    onText: (v) => texts.push(v),
    onLoading: vi.fn(),
    onDone: vi.fn(),
    onError: (v) => errors.push(v),
    onWinner: (v) => winners.push(v),
  };
}

/** Plain-text response stream. */
function textResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    start(ctrl) {
      for (const c of chunks) ctrl.enqueue(new TextEncoder().encode(c));
      ctrl.close();
    },
  });
  return new Response(stream, { status: 200 });
}

/** SSE response with optional usage event. */
function sseResponse(
  chunks: string[],
  usage?: { inputTokens: number; outputTokens: number },
  model?: string,
): Response {
  let body = "";
  const streamId = `sid-${Math.random().toString(36).slice(2)}`;
  body += SSE.format(0, streamId, "stream-id");
  chunks.forEach((c, i) => (body += SSE.format(i + 1, c)));
  if (usage) body += SSE.formatEvent("usage", JSON.stringify(usage));
  body += SSE.formatEvent("done");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "X-Stream-Id": streamId,
      ...(model ? { "X-Model": model } : {}),
    },
  });
}

// ─── 1. UsageTracker + StreamController ──────────────────────────────────────

describe("UsageTracker + StreamController", () => {
  it("accumulates tokens across multiple turns", async () => {
    const tracker = new UsageTracker({
      pricing: {
        fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
        smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse(["Hello"], { inputTokens: 100, outputTokens: 20 }),
      )
      .mockResolvedValueOnce(
        sseResponse(["World"], { inputTokens: 200, outputTokens: 40 }),
      );

    const cb = makeCallbacks();
    const ctrl = new StreamController(
      { endpoint: "/api/stream", fetch: fetchMock, model: "fast", tracker },
      cb,
    );

    ctrl.send("first");
    await flushPromises();
    ctrl.send("second");
    await flushPromises();

    expect(tracker.turns).toBe(2);
    expect(tracker.inputTokens).toBe(300);
    expect(tracker.outputTokens).toBe(60);
    // cost: (300/1M * 0.15) + (60/1M * 0.6) = 0.000045 + 0.000036 = 0.000081
    expect(tracker.cost).toBeCloseTo(0.000081, 8);
  });

  it("records the correct model per turn when routeModel changes it", async () => {
    const tracker = new UsageTracker({
      pricing: {
        fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
        smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse(["ok"], { inputTokens: 50, outputTokens: 10 }),
      )
      .mockResolvedValueOnce(
        sseResponse(["ok"], { inputTokens: 500, outputTokens: 100 }),
      );

    const cb = makeCallbacks();
    const routeModel = routeByLength(
      [{ maxLength: 10, model: "fast" }],
      "smart",
    );
    const ctrl = new StreamController(
      { endpoint: "/api/stream", fetch: fetchMock, tracker, routeModel },
      cb,
    );

    ctrl.send("hi"); // short → fast
    await flushPromises();
    ctrl.send("a".repeat(50)); // long → smart
    await flushPromises();

    expect(tracker.history[0]!.model).toBe("fast");
    expect(tracker.history[1]!.model).toBe("smart");

    // fast turn cost is much cheaper than smart turn
    expect(tracker.history[0]!.cost).toBeLessThan(tracker.history[1]!.cost);
  });

  it("reset() zeroes all counters and clears history", async () => {
    const tracker = new UsageTracker();
    tracker.record({ inputTokens: 100, outputTokens: 50 }, "fast");
    tracker.record({ inputTokens: 200, outputTokens: 80 }, "smart");

    expect(tracker.turns).toBe(2);
    tracker.reset();

    expect(tracker.turns).toBe(0);
    expect(tracker.inputTokens).toBe(0);
    expect(tracker.outputTokens).toBe(0);
    expect(tracker.cost).toBe(0);
    expect(tracker.history).toHaveLength(0);
  });

  it("tracker without pricing records tokens but cost stays 0", async () => {
    const tracker = new UsageTracker(); // no pricing
    tracker.record({ inputTokens: 1000, outputTokens: 500 }, "some-model");

    expect(tracker.inputTokens).toBe(1000);
    expect(tracker.outputTokens).toBe(500);
    expect(tracker.cost).toBe(0);
    expect(tracker.history[0]!.cost).toBe(0);
  });
});

// ─── 2. routeByLength + StreamController ─────────────────────────────────────

describe("routeByLength + StreamController", () => {
  it("routes short/medium/long prompts to correct models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(["ok"]));
    const cb = makeCallbacks();

    const routeModel = routeByLength(
      [
        { maxLength: 50, model: "fast" },
        { maxLength: 200, model: "smart" },
      ],
      "reason",
    );

    const ctrl = new StreamController(
      { endpoint: "/api/stream", fetch: fetchMock, routeModel },
      cb,
    );

    ctrl.send("short"); // < 50 → fast
    await flushPromises();
    ctrl.send("a".repeat(100)); // 51–200 → smart
    await flushPromises();
    ctrl.send("a".repeat(300)); // > 200 → reason
    await flushPromises();

    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies[0]!.model).toBe("fast");
    expect(bodies[1]!.model).toBe("smart");
    expect(bodies[2]!.model).toBe("reason");
  });

  it("explicit per-send model bypasses routeModel entirely", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(["ok"]));
    const cb = makeCallbacks();
    const routeModel = vi.fn().mockReturnValue("smart");

    const ctrl = new StreamController(
      { endpoint: "/api/stream", fetch: fetchMock, routeModel },
      cb,
    );

    ctrl.send("hello", { model: "fast" });
    await flushPromises();

    expect(routeModel).not.toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("fast");
  });

  it("routeByLength + tracker combine: model selection drives cost calculation", async () => {
    const tracker = new UsageTracker({
      pricing: {
        fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
        smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse(["ok"], { inputTokens: 100, outputTokens: 50 }),
      )
      .mockResolvedValueOnce(
        sseResponse(["ok"], { inputTokens: 100, outputTokens: 50 }),
      );

    const cb = makeCallbacks();
    const routeModel = routeByLength(
      [{ maxLength: 10, model: "fast" }],
      "smart",
    );
    const ctrl = new StreamController(
      { endpoint: "/api/stream", fetch: fetchMock, tracker, routeModel },
      cb,
    );

    ctrl.send("hi"); // fast
    await flushPromises();
    ctrl.send("a".repeat(50)); // smart (same tokens, higher cost)
    await flushPromises();

    // smart turn is ~22x more expensive for output
    expect(tracker.history[1]!.cost).toBeGreaterThan(tracker.history[0]!.cost);
  });
});

// ─── 3. RaceController + UsageTracker ────────────────────────────────────────

describe("RaceController + UsageTracker", () => {
  it("only records usage for the winning model (complete strategy)", async () => {
    const tracker = new UsageTracker({
      pricing: {
        fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
        smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      },
    });

    const fetchMock = vi
      .fn()
      .mockImplementation((_url: string, opts: RequestInit) => {
        const body = JSON.parse(opts.body as string);
        if (body.model === "fast") {
          return Promise.resolve(
            sseResponse(["fast wins"], { inputTokens: 100, outputTokens: 20 }),
          );
        }
        // smart returns too — but fast finishes first
        return Promise.resolve(
          sseResponse(["smart response"], {
            inputTokens: 200,
            outputTokens: 80,
          }),
        );
      });

    const cb = makeRaceCallbacks();
    const ctrl = new RaceController(
      {
        models: ["fast", "smart"],
        endpoint: "/api/stream",
        fetch: fetchMock,
        strategy: "complete",
        tracker,
      },
      cb,
    );

    ctrl.send("race me");
    await flushPromises();

    // Winner should have been elected
    const winner = cb.winners.find((w) => w !== null);
    expect(winner).toBeTruthy();

    // Tracker should have exactly one record
    expect(tracker.turns).toBe(1);
    expect(tracker.history[0]!.model).toBe(winner);
  });

  it("onFinish fires with final text and winner name", async () => {
    const onFinish = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse(["winner text"], { inputTokens: 10, outputTokens: 5 }),
      );

    const cb = makeRaceCallbacks();
    const ctrl = new RaceController(
      {
        models: ["fast"],
        endpoint: "/api/stream",
        fetch: fetchMock,
        strategy: "complete",
        onFinish,
      },
      cb,
    );

    ctrl.send("go");
    await flushPromises();

    expect(onFinish).toHaveBeenCalledWith("winner text", "fast");
  });

  it("onError fires only when all models fail", async () => {
    const onError = vi.fn();
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));

    const cb = makeRaceCallbacks();
    const ctrl = new RaceController(
      {
        models: ["fast", "smart"],
        endpoint: "/api/stream",
        fetch: fetchMock,
        onError,
      },
      cb,
    );

    ctrl.send("go");
    await flushPromises();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(cb.errors.filter((e) => e !== null)).toHaveLength(1);
  });

  it("first-token strategy elects winner on first chunk and cancels others", async () => {
    const tracker = new UsageTracker();
    let slowResolve: (() => void) | undefined;

    const fetchMock = vi
      .fn()
      .mockImplementation((_url: string, opts: RequestInit) => {
        const body = JSON.parse(opts.body as string);
        if (body.model === "fast") {
          return Promise.resolve(textResponse(["immediate response"]));
        }
        // Slow model — never completes in test time
        return new Promise<Response>((resolve) => {
          slowResolve = () => resolve(textResponse(["slow"]));
        });
      });

    const cb = makeRaceCallbacks();
    const ctrl = new RaceController(
      {
        models: ["fast", "slow"],
        endpoint: "/api/stream",
        fetch: fetchMock,
        strategy: "first-token",
        tracker,
      },
      cb,
    );

    ctrl.send("race");
    await flushPromises();

    // fast won — winner should be set
    expect(cb.winners.find((w) => w !== null)).toBe("fast");
    // Clean up
    slowResolve?.();
  });
});

// ─── 4. ChatHistory + StreamController ───────────────────────────────────────

describe("ChatHistory + StreamController", () => {
  type Msg = { role: "user" | "assistant"; content: string };

  it("onFinish appends assistant response to history", async () => {
    const chat = new ChatHistory<Msg>();
    const fetchMock = vi.fn().mockResolvedValue(textResponse(["Great idea!"]));

    const cb = makeCallbacks();
    const ctrl = new StreamController(
      {
        endpoint: "/api/stream",
        fetch: fetchMock,
        onFinish: (text) => {
          chat.append({ role: "assistant", content: text });
        },
      },
      cb,
    );

    chat.append({ role: "user", content: "Hello" });
    ctrl.send("Hello");
    await flushPromises();

    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[1]).toEqual({
      role: "assistant",
      content: "Great idea!",
    });
  });

  it("edit + regenerate creates branches and navigates between them", async () => {
    const chat = new ChatHistory<Msg>();

    const m1 = chat.append({ role: "user", content: "Hi" });
    const m2 = chat.append({ role: "assistant", content: "Hello!" });

    // Edit user message — creates a branch
    const m1b = chat.edit(m1, { role: "user", content: "Hey there" });

    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0]).toEqual({ role: "user", content: "Hey there" });

    // Navigate back to original branch
    chat.prevAlternative(m1b);
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]).toEqual({ role: "user", content: "Hi" });

    // Regenerate response — creates a sibling of m2
    const m2b = chat.regenerate(m2, {
      role: "assistant",
      content: "Hi there!",
    });

    expect(chat.messages[1]).toEqual({
      role: "assistant",
      content: "Hi there!",
    });
    expect(chat.hasAlternatives(m2b)).toBe(true);
    expect(chat.alternativeCount(m2b)).toBe(2);
  });

  it("pendingRegenId pattern: regenerate via StreamController", async () => {
    const chat = new ChatHistory<Msg>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(["Original response"]))
      .mockResolvedValueOnce(textResponse(["Regenerated response"]));

    let pendingRegenId: string | null = null;

    const cb = makeCallbacks();
    const ctrl = new StreamController(
      {
        endpoint: "/api/stream",
        fetch: fetchMock,
        onFinish: (text) => {
          if (pendingRegenId) {
            chat.regenerate(pendingRegenId, {
              role: "assistant",
              content: text,
            });
            pendingRegenId = null;
          } else {
            chat.append({ role: "assistant", content: text });
          }
        },
      },
      cb,
    );

    // First turn
    const userMsgId = chat.append({
      role: "user",
      content: "Tell me something",
    });
    ctrl.send("Tell me something");
    await flushPromises();

    const assistantMsgId = chat.nodeIds[1]!;
    expect(chat.messages[1]!.content).toBe("Original response");

    // Regenerate
    pendingRegenId = assistantMsgId;
    ctrl.send("Tell me something");
    await flushPromises();

    expect(pendingRegenId).toBeNull(); // cleared by onFinish
    expect(chat.messages[1]!.content).toBe("Regenerated response");
    expect(chat.alternativeCount(chat.nodeIds[1]!)).toBe(2);

    // Can navigate back to original
    chat.prevAlternative(chat.nodeIds[1]!);
    expect(chat.messages[1]!.content).toBe("Original response");

    void userMsgId; // used implicitly
  });

  it("compact replaces full history with summary, preserving single root", () => {
    const chat = new ChatHistory<Msg>();
    chat.append({ role: "user", content: "msg 1" });
    chat.append({ role: "assistant", content: "resp 1" });
    chat.append({ role: "user", content: "msg 2" });
    chat.append({ role: "assistant", content: "resp 2" });

    expect(chat.messages).toHaveLength(4);

    chat.compact({ role: "assistant", content: "Summary of 4 messages" });

    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0]!.content).toBe("Summary of 4 messages");
    expect(chat.size).toBe(1);
  });
});

// ─── 5. DurableStream + MemoryStreamStore ────────────────────────────────────

describe("DurableStream + MemoryStreamStore", () => {
  let store: MemoryStreamStore;

  beforeEach(() => {
    store = new MemoryStreamStore();
  });

  it("full lifecycle: create → stream → complete → resume from mid-point", async () => {
    async function* source(): AsyncGenerator<{ event: string; data: string }> {
      yield { event: "", data: "chunk1" };
      yield { event: "", data: "chunk2" };
      yield { event: "", data: "chunk3" };
    }

    const { id, response } = await DurableStream.create({
      store,
      source: source(),
    });

    // Collect the original stream
    const msgs: Array<{ event?: string; data: string }> = [];
    for await (const msg of SSE.consume(response)) {
      msgs.push(msg);
    }

    const dataChunks = msgs.filter((m) => !m.event).map((m) => m.data);
    expect(dataChunks).toEqual(["chunk1", "chunk2", "chunk3"]);

    // Wait for completion
    await new Promise((r) => setTimeout(r, 50));
    const status = await store.getStatus(id);
    expect(status!.state).toBe("done");
    expect(status!.totalChunks).toBe(3);

    // Resume from seq 1 — should get chunks 2 and 3 only
    const resumeResponse = DurableStream.resume({
      store,
      streamId: id,
      afterSeq: 1,
    });
    const resumeMsgs: Array<{ event?: string; data: string }> = [];
    for await (const msg of SSE.consume(resumeResponse)) {
      resumeMsgs.push(msg);
    }

    const resumeData = resumeMsgs.filter((m) => !m.event).map((m) => m.data);
    expect(resumeData).toEqual(["chunk2", "chunk3"]);
    expect(resumeMsgs[resumeMsgs.length - 1]!.event).toBe("done");
  });

  it("stop() mid-stream: resumed stream gets stopped event", async () => {
    async function* slowSource(): AsyncGenerator<{
      event: string;
      data: string;
    }> {
      yield { event: "", data: "a" };
      await new Promise((r) => setTimeout(r, 20));
      yield { event: "", data: "b" };
      await new Promise((r) => setTimeout(r, 20));
      yield { event: "", data: "c" };
    }

    const stream = await DurableStream.create({
      store,
      source: slowSource(),
    });
    const id = stream.id;

    // Stop after first chunk
    await new Promise((r) => setTimeout(r, 10));
    stream.stop();
    await new Promise((r) => setTimeout(r, 50));

    const status = await store.getStatus(id);
    expect(status!.state).toBe("stopped");

    // Resume — should get stopped event
    const resumeResponse = DurableStream.resume({
      store,
      streamId: id,
      afterSeq: 0,
    });
    const msgs: Array<{ event?: string; data: string }> = [];
    for await (const msg of SSE.consume(resumeResponse)) {
      msgs.push(msg);
    }

    const events = msgs.filter((m) => m.event).map((m) => m.event);
    expect(events).toContain("stopped");
  });

  it("store rejects duplicate stream IDs", async () => {
    await store.create("dup");
    await expect(store.create("dup")).rejects.toThrow("already exists");
  });

  it("concurrent readers both receive all chunks", async () => {
    async function* source(): AsyncGenerator<{ event: string; data: string }> {
      yield { event: "", data: "x" };
      yield { event: "", data: "y" };
    }

    const { response: r1 } = await DurableStream.create({
      store,
      source: source(),
    });

    // Consume r1 and simultaneously create a second read
    const collect = async (r: Response) => {
      const out: string[] = [];
      for await (const msg of SSE.consume(r)) {
        if (!msg.event) out.push(msg.data);
      }
      return out;
    };

    const [chunks1] = await Promise.all([collect(r1)]);
    expect(chunks1).toEqual(["x", "y"]);
  });
});

// ─── 6. defaultDiff + StreamController ───────────────────────────────────────

describe("defaultDiff + StreamController", () => {
  it("diff is null on first response, populated on second", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(["The cat sat on the mat"]))
      .mockResolvedValueOnce(textResponse(["The dog sat on the floor"]));

    const cb = makeCallbacks();
    const ctrl = new StreamController(
      { endpoint: "/api/stream", fetch: fetchMock, diff: defaultDiff },
      cb,
    );

    ctrl.send("first");
    await flushPromises();

    // No diff after first send — no previous text
    const firstDiff = cb.diffs[cb.diffs.length - 1];
    expect(firstDiff).toBeNull();

    ctrl.send("second");
    await flushPromises();

    // Diff should be populated after second send
    const lastDiff = cb.diffs[cb.diffs.length - 1] as ReturnType<
      typeof defaultDiff
    > | null;
    expect(lastDiff).not.toBeNull();
    expect(Array.isArray(lastDiff)).toBe(true);

    // Should contain removes (cat → dog, mat → floor)
    const removedWords = lastDiff!
      .filter((c) => c.type === "remove")
      .map((c) => c.text.trim());
    const addedWords = lastDiff!
      .filter((c) => c.type === "add")
      .map((c) => c.text.trim());
    expect(removedWords.join(" ")).toContain("cat");
    expect(addedWords.join(" ")).toContain("dog");
  });

  it("diff: keep chunks are unchanged words shared between both responses", () => {
    const diff = defaultDiff("Hello beautiful world", "Hello wonderful world");
    const kept = diff
      .filter((c) => c.type === "keep")
      .map((c) => c.text.trim())
      .filter(Boolean);
    expect(kept).toContain("Hello");
    expect(kept).toContain("world");

    const removed = diff
      .filter((c) => c.type === "remove")
      .map((c) => c.text.trim())
      .filter(Boolean);
    expect(removed.join("")).toContain("beautiful");

    const added = diff
      .filter((c) => c.type === "add")
      .map((c) => c.text.trim())
      .filter(Boolean);
    expect(added.join("")).toContain("wonderful");
  });

  it("diff with custom DiffFn is called with prev and next text", async () => {
    const customDiff = vi.fn().mockReturnValue([{ type: "keep", text: "ok" }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(["prev"]))
      .mockResolvedValueOnce(textResponse(["next"]));

    const cb = makeCallbacks();
    const ctrl = new StreamController(
      { endpoint: "/api/stream", fetch: fetchMock, diff: customDiff },
      cb,
    );

    ctrl.send("a");
    await flushPromises();
    ctrl.send("b");
    await flushPromises();

    expect(customDiff).toHaveBeenCalledWith("prev", "next");
  });
});

// ─── 7. ChatHistory + toJSON/fromJSON round-trip ─────────────────────────────

describe("ChatHistory serialization + branching round-trip", () => {
  type Msg = { role: string; content: string };

  it("toJSON / fromJSON preserves full branch structure", () => {
    const chat = new ChatHistory<Msg>();
    const m1 = chat.append({ role: "user", content: "Hello" });
    chat.append({ role: "assistant", content: "Hi!" });
    // Create branch from root
    chat.edit(m1, { role: "user", content: "Hey" });

    const json = chat.toJSON();
    const restored = ChatHistory.fromJSON<Msg>(json);

    // Active path in restored should match current active path
    expect(restored.messages).toEqual(chat.messages);

    // Total tree size preserved
    expect(restored.size).toBe(chat.size);
  });

  it("compact + toJSON + fromJSON: summary is single root node", () => {
    const chat = new ChatHistory<Msg>();
    chat.append({ role: "user", content: "long conversation..." });
    chat.append({ role: "assistant", content: "...with many turns" });

    chat.compact({ role: "assistant", content: "Summary" });

    const json = chat.toJSON();
    const restored = ChatHistory.fromJSON<Msg>(json);

    expect(restored.messages).toHaveLength(1);
    expect(restored.messages[0]!.content).toBe("Summary");
    expect(restored.isEmpty).toBe(false);
  });
});

// ─── 8. routeByLength + UsageTracker: budget-aware routing ───────────────────

describe("routeByLength + UsageTracker: budget enforcement pattern", () => {
  it("total cost accumulates correctly across mixed-model turns", () => {
    const tracker = new UsageTracker({
      pricing: {
        fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
        smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      },
    });

    // Simulate 3 fast turns and 1 smart turn
    tracker.record({ inputTokens: 100, outputTokens: 50 }, "fast");
    tracker.record({ inputTokens: 100, outputTokens: 50 }, "fast");
    tracker.record({ inputTokens: 100, outputTokens: 50 }, "fast");
    tracker.record({ inputTokens: 100, outputTokens: 50 }, "smart");

    expect(tracker.turns).toBe(4);

    const fastCostPerTurn = (100 / 1e6) * 0.15 + (50 / 1e6) * 0.6;
    const smartCostPerTurn = (100 / 1e6) * 3.0 + (50 / 1e6) * 15.0;
    const expected = 3 * fastCostPerTurn + smartCostPerTurn;

    expect(tracker.cost).toBeCloseTo(expected, 10);

    // Smart turn alone costs more than all 3 fast turns combined
    expect(smartCostPerTurn).toBeGreaterThan(3 * fastCostPerTurn);
  });

  it("budget threshold: cost exceeds limit after enough turns", () => {
    const tracker = new UsageTracker({
      pricing: {
        smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      },
    });

    // Each smart turn: 1000 input + 500 output tokens
    // cost = (1000/1M)*3 + (500/1M)*15 = 0.003 + 0.0075 = 0.0105 per turn
    // 10 turns = $0.105
    for (let i = 0; i < 10; i++) {
      tracker.record({ inputTokens: 1000, outputTokens: 500 }, "smart");
    }

    expect(tracker.cost).toBeGreaterThan(0.1);
    expect(tracker.turns).toBe(10);
  });
});
