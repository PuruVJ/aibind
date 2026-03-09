import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  StructuredStreamController,
  type StructuredStreamCallbacks,
} from "../src/structured-stream-controller";
import type { DeepPartial } from "../src/types";

// --- Helpers ---

interface TestSchema {
  name: string;
  age: number;
}

function createCallbacks(): StructuredStreamCallbacks<TestSchema> & {
  calls: Record<string, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {
    onLoading: [],
    onDone: [],
    onError: [],
    onStatus: [],
    onStreamId: [],
    onCanResume: [],
    onPartial: [],
    onData: [],
  };
  return {
    calls,
    onLoading: (v) => calls.onLoading.push(v),
    onDone: (v) => calls.onDone.push(v),
    onError: (v) => calls.onError.push(v),
    onStatus: (v) => calls.onStatus.push(v),
    onStreamId: (v) => calls.onStreamId.push(v),
    onCanResume: (v) => calls.onCanResume.push(v),
    onPartial: (v) => calls.onPartial.push(v),
    onData: (v) => calls.onData.push(v),
  };
}

/**
 * Build a fake SSE response as the server's /structured endpoint would emit:
 * partial events, then a data event, then done.
 */
function createStructuredSSEResponse(
  partials: unknown[],
  finalData: unknown,
  status = 200,
): Response {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  for (const partial of partials) {
    parts.push(
      encoder.encode(`event: partial\ndata: ${JSON.stringify(partial)}\n\n`),
    );
  }
  if (finalData !== undefined) {
    parts.push(
      encoder.encode(`event: data\ndata: ${JSON.stringify(finalData)}\n\n`),
    );
  }
  parts.push(encoder.encode("event: done\n\n"));

  const stream = new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** Create a fake StandardSchemaV1 that validates successfully. */
function createFakeSchema(
  jsonSchema: Record<string, unknown> | null = null,
  vendor?: string,
): any {
  return {
    "~standard": {
      version: 1,
      vendor: vendor ?? "test",
      jsonSchema: jsonSchema ?? undefined,
      validate: vi.fn((input: unknown) => ({ value: input })),
    },
  };
}

/** Create a fake schema that fails validation. */
function createFailingSchema(errors: string[]): any {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: vi.fn(() => ({
        issues: errors.map((message) => ({ message })),
      })),
    },
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// --- Tests ---

describe("StructuredStreamController", () => {
  let cb: ReturnType<typeof createCallbacks>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cb = createCallbacks();
    fetchMock = vi.fn();
    vi.clearAllMocks();
  });

  // --- Partial events ---

  describe("partial SSE events", () => {
    it("emits partial objects as partial events arrive", async () => {
      const schema = createFakeSchema({ type: "object" });
      fetchMock.mockResolvedValue(
        createStructuredSSEResponse(
          [{ name: "Al" }, { name: "Alice", age: 30 }],
          { name: "Alice", age: 30 },
        ),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe someone");
      await flushPromises();

      const partials = cb.calls.onPartial.filter((v) => v !== null);
      expect(partials).toHaveLength(2);
      expect(partials[0]).toEqual({ name: "Al" });
      expect(partials[1]).toEqual({ name: "Alice", age: 30 });
    });

    it("emits no partials when partialOutputStream is empty", async () => {
      const schema = createFakeSchema({ type: "object" });
      fetchMock.mockResolvedValue(
        createStructuredSSEResponse([], { name: "Alice", age: 30 }),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      const partials = cb.calls.onPartial.filter((v) => v !== null);
      expect(partials).toHaveLength(0);
    });
  });

  // --- Data event ---

  describe("data SSE event", () => {
    it("emits validated data when data event arrives", async () => {
      const schema = createFakeSchema({ type: "object" });
      fetchMock.mockResolvedValue(
        createStructuredSSEResponse([], { name: "Alice", age: 30 }),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      const data = cb.calls.onData.filter((v) => v !== null);
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({ name: "Alice", age: 30 });
    });

    it("calls onFinish with validated data", async () => {
      const onFinish = vi.fn();
      const schema = createFakeSchema();
      fetchMock.mockResolvedValue(
        createStructuredSSEResponse([], { name: "Bob", age: 25 }),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema, onFinish },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      expect(onFinish).toHaveBeenCalledWith({ name: "Bob", age: 25 });
    });

    it("does not call onData when no data event is received", async () => {
      const schema = createFakeSchema();
      // No finalData — only done event
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("event: done\n\n"));
          controller.close();
        },
      });
      fetchMock.mockResolvedValue(
        new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      const data = cb.calls.onData.filter((v) => v !== null);
      expect(data).toHaveLength(0);
      expect(cb.calls.onStatus).not.toContain("error");
    });
  });

  // --- Validation ---

  describe("validation", () => {
    it("throws on validation failure and sets error status", async () => {
      const schema = createFailingSchema([
        "name is required",
        "age must be positive",
      ]);
      fetchMock.mockResolvedValue(
        createStructuredSSEResponse([], { invalid: true }),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      expect(cb.calls.onStatus).toContain("error");
      const errors = cb.calls.onError.filter((e) => e !== null);
      expect(errors.length).toBeGreaterThan(0);
      expect((errors[0] as Error).message).toContain("Validation failed");
      expect((errors[0] as Error).message).toContain("name is required");
    });

    it("does NOT call onData or onFinish on validation failure", async () => {
      const onFinish = vi.fn();
      const schema = createFailingSchema(["bad data"]);
      fetchMock.mockResolvedValue(createStructuredSSEResponse([], { x: 1 }));

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema, onFinish },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      const data = cb.calls.onData.filter((v) => v !== null);
      expect(data).toEqual([]);
      expect(onFinish).not.toHaveBeenCalled();
    });

    it("async schema validation works", async () => {
      const schema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: vi.fn(async (input: unknown) => {
            await new Promise((r) => setTimeout(r, 10));
            return { value: input };
          }),
        },
      };
      fetchMock.mockResolvedValue(
        createStructuredSSEResponse([], { name: "test", age: 1 }),
      );

      const ctrl = new StructuredStreamController(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb as any,
      );
      ctrl.send("describe");
      await flushPromises();
      await new Promise((r) => setTimeout(r, 50));

      const data = (cb.calls.onData as any[]).filter((v) => v !== null);
      expect(data[0]).toEqual({ name: "test", age: 1 });
    });
  });

  // --- Schema resolution ---

  describe("schema resolution", () => {
    it("includes jsonSchema in request body when available", async () => {
      const schema = createFakeSchema({
        type: "object",
        properties: { name: { type: "string" } },
      });
      fetchMock.mockResolvedValue(
        createStructuredSSEResponse([], { name: "test", age: 1 }),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.schema).toEqual({
        type: "object",
        properties: { name: { type: "string" } },
      });
    });

    it("uses toJsonSchema() for ArkType-like schemas", async () => {
      const schema = {
        "~standard": {
          version: 1,
          vendor: "arktype",
          validate: vi.fn((input: unknown) => ({ value: input })),
        },
        toJsonSchema: () => ({
          type: "object",
          properties: { age: { type: "number" } },
        }),
      };
      fetchMock.mockResolvedValue(
        createStructuredSSEResponse([], { name: "x", age: 25 }),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.schema).toEqual({
        type: "object",
        properties: { age: { type: "number" } },
      });
    });

    it("sends no schema when none can be resolved", async () => {
      const schema = createFakeSchema(null, "unknown-vendor");
      fetchMock.mockResolvedValue(
        createStructuredSSEResponse([], { name: "test", age: 1 }),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.schema).toBeUndefined();
    });

    it("caches resolved schema across sends", async () => {
      const toJsonSchema = vi.fn(() => ({ type: "object" }));
      const schema = {
        "~standard": {
          version: 1,
          vendor: "arktype",
          validate: vi.fn((input: unknown) => ({ value: input })),
        },
        toJsonSchema,
      };
      fetchMock.mockResolvedValue(
        createStructuredSSEResponse([], { name: "a", age: 1 }),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );

      ctrl.send("first");
      await flushPromises();

      fetchMock.mockResolvedValue(
        createStructuredSSEResponse([], { name: "b", age: 2 }),
      );
      ctrl.send("second");
      await flushPromises();

      expect(toJsonSchema).toHaveBeenCalledTimes(1);
    });
  });

  // --- Reset state ---

  describe("state reset", () => {
    it("resets partial and data on new send", async () => {
      const schema = createFakeSchema();
      fetchMock
        .mockResolvedValueOnce(
          createStructuredSSEResponse([], { name: "Alice", age: 30 }),
        )
        .mockResolvedValueOnce(
          createStructuredSSEResponse([], { name: "Bob", age: 25 }),
        );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );

      ctrl.send("first");
      await flushPromises();

      expect(cb.calls.onData).toContainEqual({ name: "Alice", age: 30 });

      ctrl.send("second");
      await flushPromises();

      expect(cb.calls.onData).toContain(null);
      expect(cb.calls.onPartial).toContain(null);
    });
  });

  // --- Vendor-specific schema errors ---

  describe("vendor-specific schema resolution errors", () => {
    it("throws when valibot vendor detected but @valibot/to-json-schema not installed", async () => {
      const schema = createFakeSchema(null, "valibot");
      fetchMock.mockResolvedValue(createStructuredSSEResponse([], { x: 1 }));

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await new Promise((r) => setTimeout(r, 100));

      expect(cb.calls.onStatus).toContain("error");
      const errors = cb.calls.onError.filter((e) => e !== null);
      expect((errors[0] as Error).message).toContain("valibot");
    });

    it("throws when zod vendor detected but zod/v4 not available", async () => {
      const schema = createFakeSchema(null, "zod");
      fetchMock.mockResolvedValue(createStructuredSSEResponse([], { x: 1 }));

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await new Promise((r) => setTimeout(r, 100));

      expect(cb.calls.onStatus).toContain("error");
      const errors = cb.calls.onError.filter((e) => e !== null);
      expect((errors[0] as Error).message).toContain("zod");
    });

    it("falls through when toJsonSchema() throws", async () => {
      const schema = {
        "~standard": {
          version: 1,
          vendor: "unknown-vendor",
          validate: vi.fn((input: unknown) => ({ value: input })),
        },
        toJsonSchema: () => {
          throw new Error("not supported");
        },
      };
      fetchMock.mockResolvedValue(
        createStructuredSSEResponse([], { name: "test", age: 1 }),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.schema).toBeUndefined();

      const data = cb.calls.onData.filter((v) => v !== null);
      expect(data[0]).toEqual({ name: "test", age: 1 });
    });

    it("skips empty jsonSchema object (keys length === 0)", async () => {
      const schema = {
        "~standard": {
          version: 1,
          vendor: "test",
          jsonSchema: {},
          validate: vi.fn((input: unknown) => ({ value: input })),
        },
      };
      fetchMock.mockResolvedValue(createStructuredSSEResponse([], { x: 1 }));

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.schema).toBeUndefined();
    });
  });
});
