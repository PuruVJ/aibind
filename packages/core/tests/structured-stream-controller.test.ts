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
    onText: [],
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
    onText: (v) => calls.onText.push(v),
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

function createTextResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status });
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

  // --- Basic structured streaming ---

  describe("streaming with partial JSON", () => {
    it("emits partial objects as chunks arrive", async () => {
      const schema = createFakeSchema({ type: "object" });
      fetchMock.mockResolvedValue(
        createTextResponse(['{"name":"Al', 'ice","age":30}']),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe someone");
      await flushPromises();

      // Should have partial updates
      const partials = cb.calls.onPartial.filter((v) => v !== null);
      expect(partials.length).toBeGreaterThan(0);

      // First partial should have partial name
      const firstPartial = partials[0] as DeepPartial<TestSchema>;
      expect(firstPartial).toHaveProperty("name");
    });

    it("emits validated data on completion", async () => {
      const schema = createFakeSchema({ type: "object" });
      fetchMock.mockResolvedValue(
        createTextResponse(['{"name":"Alice","age":30}']),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      const data = cb.calls.onData.filter((v) => v !== null);
      expect(data.length).toBe(1);
      expect(data[0]).toEqual({ name: "Alice", age: 30 });
    });

    it("calls onFinish with validated data", async () => {
      const onFinish = vi.fn();
      const schema = createFakeSchema();
      fetchMock.mockResolvedValue(
        createTextResponse(['{"name":"Bob","age":25}']),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema, onFinish },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      expect(onFinish).toHaveBeenCalledWith({ name: "Bob", age: 25 });
    });
  });

  // --- Validation ---

  describe("validation", () => {
    it("throws on validation failure and sets error status", async () => {
      const schema = createFailingSchema([
        "name is required",
        "age must be positive",
      ]);
      fetchMock.mockResolvedValue(createTextResponse(['{"invalid":true}']));

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
      expect((errors[0] as Error).message).toContain("age must be positive");
    });

    it("does NOT call onData or onFinish on validation failure", async () => {
      const onFinish = vi.fn();
      const schema = createFailingSchema(["bad data"]);
      fetchMock.mockResolvedValue(createTextResponse(['{"x":1}']));

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
  });

  // --- Schema resolution ---

  describe("schema resolution", () => {
    it("includes jsonSchema in request body when available", async () => {
      const schema = createFakeSchema({ type: "object", properties: { name: { type: "string" } } });
      fetchMock.mockResolvedValue(createTextResponse(['{"name":"test"}']));

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
        toJsonSchema: () => ({ type: "object", properties: { age: { type: "number" } } }),
      };
      fetchMock.mockResolvedValue(createTextResponse(['{"age":25}']));

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
      fetchMock.mockResolvedValue(createTextResponse(['{"name":"test"}']));

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
      fetchMock.mockResolvedValue(createTextResponse(['{"name":"a"}']));

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );

      ctrl.send("first");
      await flushPromises();

      fetchMock.mockResolvedValue(createTextResponse(['{"name":"b"}']));
      ctrl.send("second");
      await flushPromises();

      // toJsonSchema should only be called once
      expect(toJsonSchema).toHaveBeenCalledTimes(1);
    });
  });

  // --- Reset state ---

  describe("state reset", () => {
    it("resets partial and data on new send", async () => {
      const schema = createFakeSchema();
      fetchMock
        .mockResolvedValueOnce(createTextResponse(['{"name":"Alice","age":30}']))
        .mockResolvedValueOnce(createTextResponse(['{"name":"Bob","age":25}']));

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );

      ctrl.send("first");
      await flushPromises();

      // Data should contain Alice
      expect(cb.calls.onData).toContainEqual({ name: "Alice", age: 30 });

      ctrl.send("second");
      await flushPromises();

      // Should have null resets between sends
      expect(cb.calls.onData).toContain(null);
      expect(cb.calls.onPartial).toContain(null);
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("handles malformed JSON gracefully during streaming", async () => {
      const schema = createFakeSchema();
      fetchMock.mockResolvedValue(createTextResponse(["not json"]));

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      // Should error during finalize (JSON.parse fails)
      expect(cb.calls.onStatus).toContain("error");
    });

    it("handles empty JSON object", async () => {
      const schema = createFakeSchema();
      fetchMock.mockResolvedValue(createTextResponse(["{}"]));

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      const data = cb.calls.onData.filter((v) => v !== null);
      expect(data).toContainEqual({});
    });

    it("handles deeply nested JSON", async () => {
      const schema = createFakeSchema();
      const nested = JSON.stringify({ a: { b: { c: { d: "deep" } } } });
      fetchMock.mockResolvedValue(createTextResponse([nested]));

      const ctrl = new StructuredStreamController(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb as any,
      );
      ctrl.send("describe");
      await flushPromises();

      const data = (cb.calls.onData as any[]).filter((v) => v !== null);
      expect(data[0]).toEqual({ a: { b: { c: { d: "deep" } } } });
    });

    it("emits multiple partial updates as incremental chunks arrive", async () => {
      const schema = createFakeSchema();
      // Simulate very granular chunks
      fetchMock.mockResolvedValue(
        createTextResponse(['{"', 'name', '":"', 'Al', 'ice', '","', 'age', '":', '30', '}']),
      );

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      // Should have multiple partial updates as the JSON grew
      const partials = cb.calls.onPartial.filter((v) => v !== null);
      expect(partials.length).toBeGreaterThanOrEqual(2);

      // Final data should be complete
      const data = cb.calls.onData.filter((v) => v !== null);
      expect(data[0]).toEqual({ name: "Alice", age: 30 });
    });

    it("handles JSON array at top level", async () => {
      const schema = createFakeSchema();
      fetchMock.mockResolvedValue(createTextResponse(['[1,2,3]']));

      const ctrl = new StructuredStreamController(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb as any,
      );
      ctrl.send("describe");
      await flushPromises();

      const data = (cb.calls.onData as any[]).filter((v) => v !== null);
      expect(data[0]).toEqual([1, 2, 3]);
    });

    it("handles JSON with special characters in strings", async () => {
      const schema = createFakeSchema();
      const obj = { name: 'O\'Brien "Jr"', note: "line1\nline2" };
      fetchMock.mockResolvedValue(createTextResponse([JSON.stringify(obj)]));

      const ctrl = new StructuredStreamController(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb as any,
      );
      ctrl.send("describe");
      await flushPromises();

      const data = (cb.calls.onData as any[]).filter((v) => v !== null);
      expect(data[0]).toEqual(obj);
    });

    it("async schema validation works", async () => {
      // Schema with async validate
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
      fetchMock.mockResolvedValue(createTextResponse(['{"name":"test"}']));

      const ctrl = new StructuredStreamController(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb as any,
      );
      ctrl.send("describe");
      await flushPromises();
      // Wait a bit more for async validation
      await new Promise((r) => setTimeout(r, 50));

      const data = (cb.calls.onData as any[]).filter((v) => v !== null);
      expect(data[0]).toEqual({ name: "test" });
    });
  });

  // --- Vendor-specific schema errors ---

  describe("vendor-specific schema resolution errors", () => {
    it("throws when valibot vendor detected but @valibot/to-json-schema not installed", async () => {
      const schema = createFakeSchema(null, "valibot");
      fetchMock.mockResolvedValue(createTextResponse(['{"x":1}']));

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      // Dynamic import rejection takes multiple ticks
      await new Promise((r) => setTimeout(r, 100));

      expect(cb.calls.onStatus).toContain("error");
      const errors = cb.calls.onError.filter((e) => e !== null);
      expect((errors[0] as Error).message).toContain("valibot");
    });

    it("throws when zod vendor detected but zod/v4 not available", async () => {
      const schema = createFakeSchema(null, "zod");
      fetchMock.mockResolvedValue(createTextResponse(['{"x":1}']));

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
        toJsonSchema: () => { throw new Error("not supported"); },
      };
      fetchMock.mockResolvedValue(createTextResponse(['{"name":"test"}']));

      const ctrl = new StructuredStreamController<TestSchema>(
        { endpoint: "/api/structured", fetch: fetchMock, schema },
        cb,
      );
      ctrl.send("describe");
      await flushPromises();

      // Should still work — just no schema sent
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.schema).toBeUndefined();

      const data = cb.calls.onData.filter((v) => v !== null);
      expect(data[0]).toEqual({ name: "test" });
    });

    it("skips empty jsonSchema object (keys length === 0)", async () => {
      // Empty jsonSchema should be treated as no schema
      const schema = {
        "~standard": {
          version: 1,
          vendor: "test",
          jsonSchema: {},
          validate: vi.fn((input: unknown) => ({ value: input })),
        },
      };
      fetchMock.mockResolvedValue(createTextResponse(['{"x":1}']));

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
