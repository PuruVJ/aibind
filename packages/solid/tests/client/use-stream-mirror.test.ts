import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("solid-js", async () => {
  const actual = await vi.importActual<typeof import("solid-js")>("solid-js");
  return {
    ...actual,
    onCleanup: vi.fn(),
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
import { onCleanup } from "solid-js";

beforeEach(() => {
  MockBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
  vi.restoreAllMocks();
  vi.mocked(onCleanup).mockImplementation(vi.fn());
});

describe("useStreamMirror (Solid)", () => {
  it("returns signals with idle initial state", () => {
    const mirror = useStreamMirror("chan");
    expect(mirror.text()).toBe("");
    expect(mirror.status()).toBe("idle");
    expect(mirror.loading()).toBe(false);
    expect(mirror.done()).toBe(false);
    expect(mirror.error()).toBeNull();
  });

  it("updates signals when a broadcast message arrives", () => {
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

    expect(mirror.text()).toBe("hello world");
    expect(mirror.status()).toBe("streaming");
    expect(mirror.loading()).toBe(true);
  });

  it("updates error signal when broadcast contains an error", () => {
    const mirror = useStreamMirror("chan");

    const sender = new MockBroadcastChannel("chan");
    sender.postMessage({
      type: "state",
      text: "",
      status: "error",
      loading: false,
      done: false,
      error: "Network error",
    });

    expect(mirror.error()).toBe("Network error");
    expect(mirror.status()).toBe("error");
  });

  it("marks done when broadcast signals completion", () => {
    const mirror = useStreamMirror("chan");

    const sender = new MockBroadcastChannel("chan");
    sender.postMessage({
      type: "state",
      text: "complete",
      status: "done",
      loading: false,
      done: true,
      error: null,
    });

    expect(mirror.done()).toBe(true);
    expect(mirror.text()).toBe("complete");
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

    expect(mirror.text()).toBe("");
  });

  it("registers onCleanup that closes the BroadcastChannel", () => {
    let capturedCleanup: (() => void) | undefined;
    vi.mocked(onCleanup).mockImplementation((fn) => {
      capturedCleanup = fn;
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

    expect(mirrorA.text()).toBe("to all");
    expect(mirrorB.text()).toBe("to all");
  });
});
