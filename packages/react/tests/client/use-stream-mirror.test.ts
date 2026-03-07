import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock react before importing hooks
vi.mock("react", () => {
  return {
    useState: <T>(init: T) => {
      let current = init;
      const get = () => current;
      const set = (v: T | ((prev: T) => T)) => {
        current = typeof v === "function" ? (v as (prev: T) => T)(current) : v;
      };
      return [get, set];
    },
    useRef: <T>(init: T) => ({ current: init }),
    useEffect: vi.fn((fn: () => unknown) => fn()),
    useMemo: <T>(fn: () => T) => fn(),
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

import { useEffect } from "react";
import { useStreamMirror } from "../../src/index.js";

beforeEach(() => {
  MockBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
  vi.restoreAllMocks();
});

describe("useStreamMirror", () => {
  it("returns idle initial state", () => {
    const mirror = useStreamMirror("chan");
    expect((mirror.text as unknown as () => string)()).toBe("");
    expect((mirror.status as unknown as () => string)()).toBe("idle");
    expect((mirror.loading as unknown as () => boolean)()).toBe(false);
    expect((mirror.done as unknown as () => boolean)()).toBe(false);
    expect((mirror.error as unknown as () => null)()).toBeNull();
  });

  it("updates state when a broadcast message arrives", () => {
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

    expect((mirror.text as unknown as () => string)()).toBe("hello world");
    expect((mirror.status as unknown as () => string)()).toBe("streaming");
    expect((mirror.loading as unknown as () => boolean)()).toBe(true);
  });

  it("updates error field when broadcast contains an error", () => {
    const mirror = useStreamMirror("chan");

    const sender = new MockBroadcastChannel("chan");
    sender.postMessage({
      type: "state",
      text: "",
      status: "error",
      loading: false,
      done: false,
      error: "Something went wrong",
    });

    expect((mirror.error as unknown as () => string)()).toBe(
      "Something went wrong",
    );
  });

  it("marks done when broadcast signals completion", () => {
    const mirror = useStreamMirror("chan");

    const sender = new MockBroadcastChannel("chan");
    sender.postMessage({
      type: "state",
      text: "finished",
      status: "done",
      loading: false,
      done: true,
      error: null,
    });

    expect((mirror.done as unknown as () => boolean)()).toBe(true);
  });

  it("ignores messages from a different channel", () => {
    const mirror = useStreamMirror("chan-a");

    const sender = new MockBroadcastChannel("chan-b");
    sender.postMessage({
      type: "state",
      text: "wrong channel",
      status: "streaming",
      loading: true,
      done: false,
      error: null,
    });

    expect((mirror.text as unknown as () => string)()).toBe("");
  });

  it("useEffect cleanup closes the BroadcastChannel", () => {
    let capturedCleanup: (() => void) | undefined;
    vi.mocked(useEffect).mockImplementationOnce((fn: () => unknown) => {
      const cleanup = fn();
      if (typeof cleanup === "function") capturedCleanup = cleanup as () => void;
    });

    useStreamMirror("chan");
    const receiverInstance = MockBroadcastChannel.instances[0];
    expect(receiverInstance).toBeDefined();

    capturedCleanup?.();
    expect(receiverInstance!.closed).toBe(true);
  });

  it("multiple simultaneous mirrors on same channel all receive updates", () => {
    const mirrorA = useStreamMirror("shared");
    const mirrorB = useStreamMirror("shared");

    const sender = new MockBroadcastChannel("shared");
    sender.postMessage({
      type: "state",
      text: "broadcast",
      status: "streaming",
      loading: true,
      done: false,
      error: null,
    });

    expect((mirrorA.text as unknown as () => string)()).toBe("broadcast");
    expect((mirrorB.text as unknown as () => string)()).toBe("broadcast");
  });
});
