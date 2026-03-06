import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CompletionController,
  type CompletionCallbacks,
} from "../src/completion-controller";

// --- Helpers ---

function createCallbacks(): CompletionCallbacks & {
  calls: Record<keyof CompletionCallbacks, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {
    onSuggestion: [],
    onLoading: [],
    onError: [],
  };
  return {
    calls: calls as Record<keyof CompletionCallbacks, unknown[]>,
    onSuggestion: (v) => calls.onSuggestion.push(v),
    onLoading: (v) => calls.onLoading.push(v),
    onError: (v) => calls.onError.push(v),
  };
}

function okResponse(text: string): Response {
  return new Response(text, { status: 200 });
}

// --- Tests ---

describe("CompletionController", () => {
  let cb: ReturnType<typeof createCallbacks>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    cb = createCallbacks();
    fetchMock = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // --- update debouncing ---

  describe("update() debouncing", () => {
    it("does not fetch before debounce delay", () => {
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 300 },
        cb,
      );
      ctrl.update("hello");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetches after debounce delay with the latest input", async () => {
      fetchMock.mockResolvedValue(okResponse(" world"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 300 },
        cb,
      );
      ctrl.update("hello");
      await vi.advanceTimersByTimeAsync(300);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.input).toBe("hello");
    });

    it("resets timer on rapid updates — only fires once for the last value", async () => {
      fetchMock.mockResolvedValue(okResponse(" there"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 300 },
        cb,
      );
      ctrl.update("hel");
      ctrl.update("hell");
      ctrl.update("hello");
      await vi.advanceTimersByTimeAsync(300);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.input).toBe("hello");
    });

    it("clears suggestion immediately on new keystroke", async () => {
      fetchMock.mockResolvedValue(okResponse(" world"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 300 },
        cb,
      );

      ctrl.update("hello");
      await vi.advanceTimersByTimeAsync(300);
      // suggestion is set
      expect(cb.calls.onSuggestion).toContain(" world");

      // New keystroke — suggestion clears before debounce fires
      ctrl.update("hello!");
      expect(cb.calls.onSuggestion[cb.calls.onSuggestion.length - 1]).toBe("");
    });
  });

  // --- minLength ---

  describe("minLength", () => {
    it("does not fetch when input is below minLength", async () => {
      const ctrl = new CompletionController(
        { fetch: fetchMock, minLength: 3 },
        cb,
      );
      ctrl.update("hi");
      await vi.advanceTimersByTimeAsync(500);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetches when input meets minLength", async () => {
      fetchMock.mockResolvedValue(okResponse("!"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, minLength: 3, debounce: 0 },
        cb,
      );
      ctrl.update("hey");
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("cancels in-flight request when input drops below minLength", async () => {
      fetchMock.mockResolvedValue(okResponse(" suggestion"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, minLength: 3, debounce: 300 },
        cb,
      );

      ctrl.update("hello");
      await vi.advanceTimersByTimeAsync(300); // fires fetch
      // Now user backspaces to "hi"
      ctrl.update("hi");
      // loading should have been reset
      expect(cb.calls.onLoading).toContain(false);
    });

    it("defaults to minLength 3", async () => {
      const ctrl = new CompletionController({ fetch: fetchMock }, cb);
      ctrl.update("ab"); // length 2 — below default
      await vi.advanceTimersByTimeAsync(500);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // --- suggestion callbacks ---

  describe("suggestion state", () => {
    it("calls onSuggestion with server response text", async () => {
      fetchMock.mockResolvedValue(okResponse("ld!"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0 },
        cb,
      );
      ctrl.update("wor");
      await vi.advanceTimersByTimeAsync(0);
      expect(cb.calls.onSuggestion).toContain("ld!");
    });

    it("calls onFinish with suggestion", async () => {
      const onFinish = vi.fn();
      fetchMock.mockResolvedValue(okResponse("!"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0, onFinish },
        cb,
      );
      ctrl.update("hey");
      await vi.advanceTimersByTimeAsync(0);
      expect(onFinish).toHaveBeenCalledWith("!");
    });

    it("sets loading true then false around the request", async () => {
      fetchMock.mockResolvedValue(okResponse("..."));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0 },
        cb,
      );
      ctrl.update("hey");
      await vi.advanceTimersByTimeAsync(0);
      expect(cb.calls.onLoading[0]).toBe(true);
      expect(cb.calls.onLoading[cb.calls.onLoading.length - 1]).toBe(false);
    });
  });

  // --- accept ---

  describe("accept()", () => {
    it("returns lastFetchedInput + suggestion and clears suggestion", async () => {
      fetchMock.mockResolvedValue(okResponse("ld!"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0 },
        cb,
      );
      ctrl.update("wor");
      await vi.advanceTimersByTimeAsync(0);

      const result = ctrl.accept();
      expect(result).toBe("world!");
      expect(cb.calls.onSuggestion[cb.calls.onSuggestion.length - 1]).toBe("");
    });

    it("returns empty string when no suggestion is set", () => {
      const ctrl = new CompletionController({ fetch: fetchMock }, cb);
      expect(ctrl.accept()).toBe("");
    });
  });

  // --- clear ---

  describe("clear()", () => {
    it("clears the suggestion without aborting the request", async () => {
      fetchMock.mockResolvedValue(okResponse("..."));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0 },
        cb,
      );
      ctrl.update("hey");
      await vi.advanceTimersByTimeAsync(0);

      ctrl.clear();
      expect(cb.calls.onSuggestion[cb.calls.onSuggestion.length - 1]).toBe("");
    });

    it("is a no-op when suggestion is already empty", () => {
      const ctrl = new CompletionController({ fetch: fetchMock }, cb);
      ctrl.clear();
      expect(cb.calls.onSuggestion).toHaveLength(0);
    });
  });

  // --- abort ---

  describe("abort()", () => {
    it("cancels a pending debounce — no fetch fired", async () => {
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 300 },
        cb,
      );
      ctrl.update("hello");
      ctrl.abort();
      await vi.advanceTimersByTimeAsync(300);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("cancels an in-flight request — suggestion never set", async () => {
      let resolve: ((r: Response) => void) | null = null;
      fetchMock.mockReturnValue(
        new Promise<Response>((r) => {
          resolve = r;
        }),
      );
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0 },
        cb,
      );
      ctrl.update("hello");
      await vi.advanceTimersByTimeAsync(0);

      ctrl.abort();
      resolve!(okResponse("should be ignored"));
      await vi.advanceTimersByTimeAsync(0);

      expect(cb.calls.onSuggestion.filter((s) => s !== "")).toHaveLength(0);
    });

    it("resets loading to false", async () => {
      fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0 },
        cb,
      );
      ctrl.update("hello");
      await vi.advanceTimersByTimeAsync(0);

      ctrl.abort();
      expect(cb.calls.onLoading[cb.calls.onLoading.length - 1]).toBe(false);
    });
  });

  // --- error handling ---

  describe("error handling", () => {
    it("calls onError on HTTP error status", async () => {
      fetchMock.mockResolvedValue(new Response("", { status: 500 }));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0 },
        cb,
      );
      ctrl.update("hello");
      await vi.advanceTimersByTimeAsync(0);

      const errors = cb.calls.onError.filter((e) => e !== null);
      expect(errors.length).toBeGreaterThan(0);
      expect((errors[0] as Error).message).toMatch(/500/);
    });

    it("calls onError callback option on error", async () => {
      const onError = vi.fn();
      fetchMock.mockRejectedValue(new Error("network down"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0, onError },
        cb,
      );
      ctrl.update("hello");
      await vi.advanceTimersByTimeAsync(0);

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("converts non-Error throwables to Error", async () => {
      fetchMock.mockRejectedValue("string error");
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0 },
        cb,
      );
      ctrl.update("hello");
      await vi.advanceTimersByTimeAsync(0);

      const errors = cb.calls.onError.filter((e) => e !== null);
      expect(errors[0]).toBeInstanceOf(Error);
    });

    it("does not set suggestion on error", async () => {
      fetchMock.mockRejectedValue(new Error("boom"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0 },
        cb,
      );
      ctrl.update("hello");
      await vi.advanceTimersByTimeAsync(0);

      expect(cb.calls.onSuggestion.filter((s) => s !== "")).toHaveLength(0);
    });
  });

  // --- request body ---

  describe("request body", () => {
    it("sends input, system, and model in body", async () => {
      fetchMock.mockResolvedValue(okResponse("!"));
      const ctrl = new CompletionController(
        {
          fetch: fetchMock,
          debounce: 0,
          model: "fast",
          system: "Continue naturally.",
        },
        cb,
      );
      ctrl.update("hey");
      await vi.advanceTimersByTimeAsync(0);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.input).toBe("hey");
      expect(body.model).toBe("fast");
      expect(body.system).toBe("Continue naturally.");
    });

    it("uses default endpoint /__aibind__/complete", async () => {
      fetchMock.mockResolvedValue(okResponse("!"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0 },
        cb,
      );
      ctrl.update("hey");
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchMock.mock.calls[0][0]).toBe("/__aibind__/complete");
    });

    it("uses custom endpoint when provided", async () => {
      fetchMock.mockResolvedValue(okResponse("!"));
      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 0, endpoint: "/api/complete" },
        cb,
      );
      ctrl.update("hey");
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchMock.mock.calls[0][0]).toBe("/api/complete");
    });
  });

  // --- concurrent updates ---

  describe("concurrent updates", () => {
    it("aborts previous in-flight request when a new debounce fires", async () => {
      let resolveFirst: ((r: Response) => void) | null = null;
      fetchMock
        .mockReturnValueOnce(
          new Promise<Response>((r) => {
            resolveFirst = r;
          }),
        )
        .mockResolvedValueOnce(okResponse("second"));

      const ctrl = new CompletionController(
        { fetch: fetchMock, debounce: 300 },
        cb,
      );

      ctrl.update("first");
      await vi.advanceTimersByTimeAsync(300); // first debounce fires
      ctrl.update("second");
      await vi.advanceTimersByTimeAsync(300); // second debounce fires

      // Resolve the first (now-aborted) request
      resolveFirst!(okResponse("first result"));
      await vi.advanceTimersByTimeAsync(0);

      // Only the second suggestion should appear
      const nonEmpty = cb.calls.onSuggestion.filter((s) => s !== "");
      expect(nonEmpty).toEqual(["second"]);
    });
  });
});
