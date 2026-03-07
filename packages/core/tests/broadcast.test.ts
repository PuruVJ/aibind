import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamBroadcaster, StreamBroadcastReceiver } from "../src/broadcast";
import { StreamController } from "../src/stream-controller";
import type { StreamCallbacks } from "../src/stream-controller";

// --- Mock BroadcastChannel ---

class MockBroadcastChannel {
  name: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  closed = false;

  static instances: MockBroadcastChannel[] = [];

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    for (const inst of MockBroadcastChannel.instances) {
      if (inst !== this && inst.name === this.name && inst.onmessage) {
        inst.onmessage(new MessageEvent("message", { data }));
      }
    }
  }

  close(): void {
    this.closed = true;
    MockBroadcastChannel.instances = MockBroadcastChannel.instances.filter(
      (i) => i !== this,
    );
  }
}

function createMockResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeCallbacks(): StreamCallbacks {
  return {
    onText: vi.fn(),
    onLoading: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onStatus: vi.fn(),
    onStreamId: vi.fn(),
    onCanResume: vi.fn(),
  };
}

beforeEach(() => {
  MockBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
});

// --- StreamBroadcaster ---

describe("StreamBroadcaster", () => {
  it("post() delivers message to receivers on same channel", () => {
    const onMessage = vi.fn();
    const receiver = new MockBroadcastChannel("test");
    receiver.onmessage = onMessage;

    const broadcaster = new StreamBroadcaster("test");
    broadcaster.post({
      text: "hello",
      status: "streaming",
      loading: true,
      done: false,
      error: null,
    });

    expect(onMessage).toHaveBeenCalledOnce();
    const msg = onMessage.mock.calls[0][0].data;
    expect(msg.type).toBe("state");
    expect(msg.text).toBe("hello");
    expect(msg.loading).toBe(true);
  });

  it("destroy() closes the channel", () => {
    const broadcaster = new StreamBroadcaster("test");
    const channel = MockBroadcastChannel.instances.at(-1)!;
    broadcaster.destroy();
    expect(channel.closed).toBe(true);
  });
});

// --- StreamBroadcastReceiver ---

describe("StreamBroadcastReceiver", () => {
  it("calls onMessage when a message is received", () => {
    const onMessage = vi.fn();
    new StreamBroadcastReceiver("chan", onMessage);

    const sender = new MockBroadcastChannel("chan");
    sender.postMessage({ type: "state", text: "hi", status: "idle", loading: false, done: false, error: null });

    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage.mock.calls[0][0].text).toBe("hi");
  });

  it("does not receive messages from a different channel", () => {
    const onMessage = vi.fn();
    new StreamBroadcastReceiver("chan-a", onMessage);

    const sender = new MockBroadcastChannel("chan-b");
    sender.postMessage({ type: "state", text: "nope", status: "idle", loading: false, done: false, error: null });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("destroy() stops receiving messages", () => {
    const onMessage = vi.fn();
    const receiver = new StreamBroadcastReceiver("chan", onMessage);
    receiver.destroy();

    const sender = new MockBroadcastChannel("chan");
    sender.postMessage({ type: "state", text: "too late", status: "idle", loading: false, done: false, error: null });

    expect(onMessage).not.toHaveBeenCalled();
  });
});

// --- StreamController.broadcast() ---

describe("StreamController.broadcast()", () => {
  it("no-ops and returns cleanup fn when BroadcastChannel is undefined", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const ctrl = new StreamController({ endpoint: "/api" }, makeCallbacks());
    const cleanup = ctrl.broadcast("test");
    expect(typeof cleanup).toBe("function");
    expect(() => cleanup()).not.toThrow();
  });

  it("immediately posts current idle state to late-joining mirrors", () => {
    const onMessage = vi.fn();
    const mirror = new MockBroadcastChannel("chan");
    mirror.onmessage = onMessage;

    const ctrl = new StreamController({ endpoint: "/api" }, makeCallbacks());
    ctrl.broadcast("chan");

    expect(onMessage).toHaveBeenCalledOnce();
    const msg = onMessage.mock.calls[0][0].data;
    expect(msg.status).toBe("idle");
    expect(msg.text).toBe("");
    expect(msg.loading).toBe(false);
    expect(msg.done).toBe(false);
    expect(msg.error).toBeNull();
  });

  it("posts state on every chunk during streaming", async () => {
    const onMessage = vi.fn();
    const mirror = new MockBroadcastChannel("chan");
    mirror.onmessage = onMessage;

    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["Hello", " World"]));
    const ctrl = new StreamController(
      { endpoint: "/api", fetch: mockFetch },
      makeCallbacks(),
    );
    ctrl.broadcast("chan");
    onMessage.mockClear(); // ignore the immediate idle post

    ctrl.send("prompt");
    await flushPromises();

    // Should have received at least one chunk update
    const calls = onMessage.mock.calls.map((c) => c[0].data);
    const streamingCalls = calls.filter((m) => m.status === "streaming" || m.text.length > 0);
    expect(streamingCalls.length).toBeGreaterThan(0);
    expect(calls.at(-1)?.done).toBe(true);
  });

  it("cleanup function closes the channel and stops broadcasting", async () => {
    const onMessage = vi.fn();
    const ctrl = new StreamController({ endpoint: "/api" }, makeCallbacks());
    const cleanup = ctrl.broadcast("chan");
    cleanup();

    const mirror = new MockBroadcastChannel("chan");
    mirror.onmessage = onMessage;
    onMessage.mockClear();

    // Subsequent send should not post to mirror
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["after cleanup"]));
    (ctrl as any)._opts.fetch = mockFetch;
    ctrl.send("prompt");
    await flushPromises();

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("replacing broadcast channel closes the old one", () => {
    const ctrl = new StreamController({ endpoint: "/api" }, makeCallbacks());
    ctrl.broadcast("chan-1");
    const firstChannel = MockBroadcastChannel.instances.find(
      (i) => i.name === "chan-1",
    );

    ctrl.broadcast("chan-2");
    expect(firstChannel?.closed).toBe(true);
  });

  it("posts error state when stream errors", async () => {
    const onMessage = vi.fn();
    const mirror = new MockBroadcastChannel("chan");
    mirror.onmessage = onMessage;

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("Not Found", { status: 404 }));
    const ctrl = new StreamController(
      { endpoint: "/api", fetch: mockFetch },
      makeCallbacks(),
    );
    ctrl.broadcast("chan");
    onMessage.mockClear();

    ctrl.send("prompt");
    await flushPromises();

    const errorCall = onMessage.mock.calls
      .map((c) => c[0].data)
      .find((m) => m.error !== null);
    expect(errorCall).toBeDefined();
    expect(typeof errorCall?.error).toBe("string");
  });
});
