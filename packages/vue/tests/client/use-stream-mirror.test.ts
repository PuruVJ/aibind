import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vue", async () => {
  const actual = await vi.importActual<typeof import("vue")>("vue");
  return {
    ...actual,
    onUnmounted: vi.fn(),
  };
});

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

import { useStreamMirror } from "../../src/index.js";
import { onUnmounted } from "vue";

beforeEach(() => {
  MockBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
  vi.restoreAllMocks();
  vi.mocked(onUnmounted).mockImplementation(vi.fn());
});

describe("useStreamMirror (Vue)", () => {
  it("returns reactive refs with idle initial state", () => {
    const mirror = useStreamMirror("chan");
    expect(mirror.text.value).toBe("");
    expect(mirror.status.value).toBe("idle");
    expect(mirror.loading.value).toBe(false);
    expect(mirror.done.value).toBe(false);
    expect(mirror.error.value).toBeNull();
  });

  it("updates refs when a broadcast message arrives", () => {
    const mirror = useStreamMirror("chan");

    const sender = new MockBroadcastChannel("chan");
    sender.postMessage({
      type: "state",
      text: "hello world",
      status: "streaming",
      loading: true,
      done: false,
      error: null,
    });

    expect(mirror.text.value).toBe("hello world");
    expect(mirror.status.value).toBe("streaming");
    expect(mirror.loading.value).toBe(true);
  });

  it("updates error ref when broadcast contains an error", () => {
    const mirror = useStreamMirror("chan");

    const sender = new MockBroadcastChannel("chan");
    sender.postMessage({
      type: "state",
      text: "",
      status: "error",
      loading: false,
      done: false,
      error: "Stream failed",
    });

    expect(mirror.error.value).toBe("Stream failed");
    expect(mirror.status.value).toBe("error");
  });

  it("marks done ref when broadcast signals completion", () => {
    const mirror = useStreamMirror("chan");

    const sender = new MockBroadcastChannel("chan");
    sender.postMessage({
      type: "state",
      text: "all done",
      status: "done",
      loading: false,
      done: true,
      error: null,
    });

    expect(mirror.done.value).toBe(true);
    expect(mirror.text.value).toBe("all done");
  });

  it("ignores messages from a different channel", () => {
    const mirror = useStreamMirror("chan-a");

    const sender = new MockBroadcastChannel("chan-b");
    sender.postMessage({
      type: "state",
      text: "wrong",
      status: "streaming",
      loading: true,
      done: false,
      error: null,
    });

    expect(mirror.text.value).toBe("");
  });

  it("registers onUnmounted cleanup that closes the channel", () => {
    let capturedCleanup: (() => void) | undefined;
    vi.mocked(onUnmounted).mockImplementation((fn) => {
      capturedCleanup = fn as () => void;
    });

    useStreamMirror("chan");
    const receiverInstance = MockBroadcastChannel.instances[0];
    expect(receiverInstance).toBeDefined();

    capturedCleanup?.();
    expect(receiverInstance!.closed).toBe(true);
  });

  it("multiple mirrors on same channel both receive updates", () => {
    const mirrorA = useStreamMirror("shared");
    const mirrorB = useStreamMirror("shared");

    const sender = new MockBroadcastChannel("shared");
    sender.postMessage({
      type: "state",
      text: "to all",
      status: "streaming",
      loading: true,
      done: false,
      error: null,
    });

    expect(mirrorA.text.value).toBe("to all");
    expect(mirrorB.text.value).toBe("to all");
  });
});
