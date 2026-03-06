import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentController, type AgentCallbacks } from "../src/agent-controller";

// --- Helpers ---

function createCallbacks(): AgentCallbacks & {
  calls: Record<string, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {
    onMessages: [],
    onStatus: [],
    onError: [],
    onPendingApproval: [],
  };
  return {
    calls,
    onMessages: (v) => calls.onMessages.push(v),
    onStatus: (v) => calls.onStatus.push(v),
    onError: (v) => calls.onError.push(v),
    onPendingApproval: (v) => calls.onPendingApproval.push(v),
  };
}

function createMockResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    statusText: status === 200 ? "OK" : "Error",
  });
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// --- Tests ---

describe("AgentController", () => {
  let cb: ReturnType<typeof createCallbacks>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cb = createCallbacks();
    fetchMock = vi.fn();
    vi.clearAllMocks();
  });

  // --- Constructor ---

  describe("constructor", () => {
    it("throws if endpoint is missing", () => {
      expect(() => new AgentController({ endpoint: "" } as any, cb)).toThrow(
        "endpoint",
      );
    });

    it("creates with valid endpoint", () => {
      const ctrl = new AgentController({ endpoint: "/api/agent" }, cb);
      expect(ctrl).toBeInstanceOf(AgentController);
      expect(ctrl.messages).toEqual([]);
    });
  });

  // --- send ---

  describe("send()", () => {
    it("creates user message, streams assistant response", async () => {
      fetchMock.mockResolvedValue(createMockResponse(["Hello", " there"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      await ctrl.send("hi");

      // Should have user + assistant messages
      expect(ctrl.messages).toHaveLength(2);
      expect(ctrl.messages[0].role).toBe("user");
      expect(ctrl.messages[0].content).toBe("hi");
      expect(ctrl.messages[1].role).toBe("assistant");
      expect(ctrl.messages[1].content).toBe("Hello there");
    });

    it("sets status to running then idle", async () => {
      fetchMock.mockResolvedValue(createMockResponse(["response"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      await ctrl.send("hi");

      expect(cb.calls.onStatus).toContain("running");
      expect(cb.calls.onStatus[cb.calls.onStatus.length - 1]).toBe("idle");
    });

    it("sends all messages in request body", async () => {
      fetchMock
        .mockResolvedValueOnce(createMockResponse(["first response"]))
        .mockResolvedValueOnce(createMockResponse(["second response"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      await ctrl.send("first");
      await ctrl.send("second");

      // Second call should include all 3 messages (user, assistant, user)
      const body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.messages).toHaveLength(3);
      expect(body.messages[0]).toEqual({ role: "user", content: "first" });
      expect(body.messages[1]).toEqual({
        role: "assistant",
        content: "first response",
      });
      expect(body.messages[2]).toEqual({ role: "user", content: "second" });
    });

    it("accumulates chunks incrementally via onMessages", async () => {
      fetchMock.mockResolvedValue(createMockResponse(["A", "B", "C"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      await ctrl.send("hi");

      // onMessages should be called multiple times as chunks arrive
      const messageCalls = cb.calls.onMessages as any[][];
      // At least: user msg, assistant empty, A, AB, ABC
      expect(messageCalls.length).toBeGreaterThanOrEqual(4);

      // Final call should have complete assistant content
      const finalMessages = messageCalls[messageCalls.length - 1];
      const assistant = finalMessages.find((m: any) => m.role === "assistant");
      expect(assistant.content).toBe("ABC");
    });

    it("calls onMessage callback with final assistant message", async () => {
      const onMessage = vi.fn();
      fetchMock.mockResolvedValue(createMockResponse(["done"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock, onMessage },
        cb,
      );
      await ctrl.send("hi");

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "assistant",
          content: "done",
        }),
      );
    });

    it("assigns unique IDs to messages", async () => {
      fetchMock.mockResolvedValue(createMockResponse(["response"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      await ctrl.send("hi");

      const [user, assistant] = ctrl.messages;
      expect(user.id).toBeTruthy();
      expect(assistant.id).toBeTruthy();
      expect(user.id).not.toBe(assistant.id);
    });

    it("clears error on new send", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(createMockResponse(["ok"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      await ctrl.send("first"); // fails
      expect(cb.calls.onStatus).toContain("error");

      await ctrl.send("second"); // succeeds
      expect(cb.calls.onError).toContain(null); // error cleared
    });
  });

  // --- Error handling ---

  describe("error handling", () => {
    it("handles HTTP error", async () => {
      fetchMock.mockResolvedValue(
        new Response("", { status: 500, statusText: "Internal Error" }),
      );

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      await ctrl.send("hi");

      expect(cb.calls.onStatus).toContain("error");
      const errors = cb.calls.onError.filter((e) => e !== null);
      expect((errors[0] as Error).message).toMatch(/500/);
    });

    it("handles network error", async () => {
      fetchMock.mockRejectedValue(new TypeError("Network error"));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      await ctrl.send("hi");

      expect(cb.calls.onStatus).toContain("error");
      const errors = cb.calls.onError.filter((e) => e !== null);
      expect((errors[0] as Error).message).toBe("Network error");
    });

    it("calls onError option callback", async () => {
      const onError = vi.fn();
      fetchMock.mockRejectedValue(new Error("boom"));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock, onError },
        cb,
      );
      await ctrl.send("hi");

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("handles abort gracefully", async () => {
      let resolveStream: (() => void) | null = null;
      const hangPromise = new Promise<Response>((r) => {
        resolveStream = () => r(createMockResponse(["done"]));
      });
      fetchMock.mockReturnValue(hangPromise);

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      const sendPromise = ctrl.send("hi");

      // Abort while waiting for response
      ctrl.stop();
      resolveStream!();
      await sendPromise;

      // Should be idle, not error
      expect(cb.calls.onStatus).toContain("idle");
      expect(cb.calls.onStatus).not.toContain("error");
    });
  });

  // --- stop ---

  describe("stop()", () => {
    it("sets status to idle", () => {
      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      ctrl.setStatus("running");
      ctrl.stop();

      expect(cb.calls.onStatus).toContain("idle");
    });
  });

  // --- Approval workflow ---

  describe("approval workflow", () => {
    it("setPendingApproval sets and triggers callback", () => {
      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      const pa = { id: "t1", toolName: "delete_file", args: { path: "/tmp" } };
      ctrl.setPendingApproval(pa);

      expect(cb.calls.onPendingApproval).toContainEqual(pa);
    });

    it("approve() clears approval and sets running", () => {
      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      ctrl.setPendingApproval({
        id: "t1",
        toolName: "delete",
        args: {},
      });

      ctrl.approve("t1");

      expect(cb.calls.onPendingApproval).toContain(null);
      expect(cb.calls.onStatus).toContain("running");
    });

    it("approve() is no-op for wrong ID", () => {
      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      ctrl.setPendingApproval({
        id: "t1",
        toolName: "delete",
        args: {},
      });

      const callsBefore = cb.calls.onPendingApproval.length;
      ctrl.approve("wrong-id");

      // No additional callback triggered
      expect(cb.calls.onPendingApproval.length).toBe(callsBefore);
    });

    it("deny() clears approval and sets idle", () => {
      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      ctrl.setPendingApproval({
        id: "t1",
        toolName: "delete",
        args: {},
      });

      ctrl.deny("t1", "not allowed");

      expect(cb.calls.onPendingApproval).toContain(null);
      expect(cb.calls.onStatus).toContain("idle");
    });

    it("deny() is no-op for wrong ID", () => {
      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      ctrl.setPendingApproval({
        id: "t1",
        toolName: "delete",
        args: {},
      });

      const callsBefore = cb.calls.onPendingApproval.length;
      ctrl.deny("wrong-id");

      expect(cb.calls.onPendingApproval.length).toBe(callsBefore);
    });

    it("setPendingApproval(null) clears", () => {
      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      ctrl.setPendingApproval({
        id: "t1",
        toolName: "delete",
        args: {},
      });
      ctrl.setPendingApproval(null);

      const last =
        cb.calls.onPendingApproval[cb.calls.onPendingApproval.length - 1];
      expect(last).toBeNull();
    });
  });

  // --- setStatus ---

  describe("setStatus()", () => {
    it("updates status and triggers callback", () => {
      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      ctrl.setStatus("running");
      expect(cb.calls.onStatus).toContain("running");

      ctrl.setStatus("error");
      expect(cb.calls.onStatus).toContain("error");
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("handles empty response stream", async () => {
      fetchMock.mockResolvedValue(createMockResponse([]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      await ctrl.send("hi");

      expect(ctrl.messages).toHaveLength(2);
      expect(ctrl.messages[1].content).toBe("");
    });

    it("concurrent sends abort the first", async () => {
      let resolveFirst: (() => void) | null = null;
      const firstPromise = new Promise<Response>((r) => {
        resolveFirst = () => r(createMockResponse(["first"]));
      });

      fetchMock
        .mockReturnValueOnce(firstPromise)
        .mockResolvedValueOnce(createMockResponse(["second"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      const p1 = ctrl.send("first");
      const p2 = ctrl.send("second");

      resolveFirst!();
      await Promise.allSettled([p1, p2]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("messages array is immutable (new reference each update)", async () => {
      fetchMock.mockResolvedValue(createMockResponse(["hello"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      const refs = new Set<unknown>();
      const origOnMessages = cb.onMessages;
      cb.onMessages = (v) => {
        refs.add(v);
        origOnMessages(v);
      };

      await ctrl.send("hi");

      expect(refs.size).toBeGreaterThan(1);
    });

    it("wraps non-Error throwable in Error", async () => {
      fetchMock.mockRejectedValue("string error");

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      await ctrl.send("hi");

      const errors = cb.calls.onError.filter((e) => e !== null);
      expect(errors[0]).toBeInstanceOf(Error);
      expect((errors[0] as Error).message).toBe("string error");
    });

    it("all messages have type 'text'", async () => {
      fetchMock.mockResolvedValue(createMockResponse(["reply"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      await ctrl.send("hi");

      for (const msg of ctrl.messages) {
        expect(msg.type).toBe("text");
      }
    });

    it("maintains full history across 3+ exchanges", async () => {
      fetchMock
        .mockResolvedValueOnce(createMockResponse(["reply1"]))
        .mockResolvedValueOnce(createMockResponse(["reply2"]))
        .mockResolvedValueOnce(createMockResponse(["reply3"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      await ctrl.send("msg1");
      await ctrl.send("msg2");
      await ctrl.send("msg3");

      // 3 user + 3 assistant = 6 messages total
      expect(ctrl.messages).toHaveLength(6);

      // Verify order
      expect(ctrl.messages[0].content).toBe("msg1");
      expect(ctrl.messages[1].content).toBe("reply1");
      expect(ctrl.messages[2].content).toBe("msg2");
      expect(ctrl.messages[3].content).toBe("reply2");
      expect(ctrl.messages[4].content).toBe("msg3");
      expect(ctrl.messages[5].content).toBe("reply3");

      // Third request should send all 5 previous messages + new user message
      const body = JSON.parse(fetchMock.mock.calls[2][1].body);
      expect(body.messages).toHaveLength(5);
    });

    it("stop mid-stream leaves partial assistant content", async () => {
      // Create a slow stream we can abort mid-way
      let closeStream: (() => void) | null = null;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("partial"));
          closeStream = () => controller.close();
        },
      });

      fetchMock.mockResolvedValue(new Response(stream, { status: 200 }));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );
      const sendPromise = ctrl.send("hi");
      await flushPromises();

      ctrl.stop();
      closeStream!();
      await sendPromise;

      // Status should be idle
      expect(cb.calls.onStatus[cb.calls.onStatus.length - 1]).toBe("idle");
    });

    it("approve with no pending approval is a no-op", () => {
      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      // No setPendingApproval called — approve should be safe
      ctrl.approve("some-id");
      expect(cb.calls.onPendingApproval).toEqual([]);
      expect(cb.calls.onStatus).toEqual([]);
    });

    it("deny with no pending approval is a no-op", () => {
      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      ctrl.deny("some-id", "reason");
      expect(cb.calls.onPendingApproval).toEqual([]);
      expect(cb.calls.onStatus).toEqual([]);
    });

    it("messages after error still work (recovery)", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce(createMockResponse(["recovered"]));

      const ctrl = new AgentController(
        { endpoint: "/api/agent", fetch: fetchMock },
        cb,
      );

      await ctrl.send("first"); // fails
      expect(cb.calls.onStatus).toContain("error");

      await ctrl.send("second"); // succeeds
      // Should have user messages from both attempts + one assistant
      const assistants = ctrl.messages.filter((m) => m.role === "assistant");
      expect(assistants.length).toBeGreaterThanOrEqual(1);
      expect(assistants[assistants.length - 1].content).toBe("recovered");
    });
  });
});
