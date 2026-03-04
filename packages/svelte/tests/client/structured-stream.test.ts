import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("svelte", () => ({ onDestroy: vi.fn() }));

// Mock these to simulate missing packages for the vendor-specific import tests
vi.mock("@valibot/to-json-schema", () => {
  throw new Error("Cannot find module @valibot/to-json-schema");
});
vi.mock("zod/v4", () => {
  throw new Error("Cannot find module zod/v4");
});

import { StructuredStream } from "../../src/lib/index.svelte.js";
import { createMockResponse, flushPromises } from "../helpers.js";

const ENDPOINT = "/api/structured";

/** Create a minimal Standard Schema v1 compliant schema. */
function createMockSchema<T>(
  validateFn: (
    input: unknown,
  ) => { value: T } | { issues: Array<{ message: string }> },
  options?: {
    jsonSchema?: Record<string, unknown>;
    vendor?: string;
    toJsonSchema?: () => Record<string, unknown>;
  },
) {
  const schema = {
    "~standard": {
      version: 1,
      vendor: options?.vendor ?? "test",
      validate: validateFn,
      ...(options?.jsonSchema ? { jsonSchema: options.jsonSchema } : {}),
    },
  };
  if (options?.toJsonSchema) {
    (schema as any).toJsonSchema = options.toJsonSchema;
  }
  return schema;
}

describe("StructuredStream", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves schema from ~standard.jsonSchema", async () => {
    const jsonSchema = {
      type: "object",
      properties: { name: { type: "string" } },
    };
    const schema = createMockSchema(
      (input) => ({ value: input as { name: string } }),
      { jsonSchema },
    );

    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"name":"test"}']));

    const stream = new StructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: ENDPOINT,
    });
    stream.send("prompt");
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        body: expect.stringContaining('"type":"object"'),
      }),
    );
  });

  it("resolves schema from toJsonSchema() method", async () => {
    const jsonSchema = {
      type: "object",
      properties: { age: { type: "number" } },
    };
    const schema = createMockSchema(
      (input) => ({ value: input as { age: number } }),
      { toJsonSchema: () => jsonSchema },
    );

    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"age":25}']));

    const stream = new StructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: ENDPOINT,
    });
    stream.send("prompt");
    await flushPromises();

    expect(stream.data).toEqual({ age: 25 });
  });

  it("throws descriptive error for valibot when import fails", async () => {
    const schema = createMockSchema((input) => ({ value: input }), {
      vendor: "valibot",
    });

    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"test":1}']));

    const stream = new StructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: ENDPOINT,
    });
    stream.send("prompt");
    await flushPromises();

    expect(stream.error).toBeInstanceOf(Error);
    expect(stream.error!.message).toContain("valibot");
    expect(stream.error!.message).toContain("@valibot/to-json-schema");
  });

  it("throws descriptive error for zod when import fails", async () => {
    const schema = createMockSchema((input) => ({ value: input }), {
      vendor: "zod",
    });

    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"test":1}']));

    const stream = new StructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: ENDPOINT,
    });
    stream.send("prompt");
    await flushPromises();

    expect(stream.error).toBeInstanceOf(Error);
    expect(stream.error!.message).toContain("zod");
  });

  it("populates .partial incrementally during stream", async () => {
    const schema = createMockSchema((input) => ({
      value: input as { name: string; age: number },
    }));

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        createMockResponse(['{"name":', '"John","age":', "30}"]),
      );

    const stream = new StructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: ENDPOINT,
    });
    stream.send("prompt");
    await flushPromises();

    // After stream completes, partial should have been set
    expect(stream.data).toEqual({ name: "John", age: 30 });
  });

  it("sets .data after successful validation", async () => {
    const schema = createMockSchema((input) => ({
      value: input as { title: string },
    }));

    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"title":"hello"}']));

    const stream = new StructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: ENDPOINT,
    });
    stream.send("prompt");
    await flushPromises();

    expect(stream.data).toEqual({ title: "hello" });
    expect(stream.done).toBe(true);
  });

  it("sets .error when validation fails", async () => {
    const schema = createMockSchema(() => ({
      issues: [{ message: "invalid type" }],
    }));

    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"bad":true}']));

    const stream = new StructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: ENDPOINT,
    });
    stream.send("prompt");
    await flushPromises();

    expect(stream.error).toBeInstanceOf(Error);
    expect(stream.error!.message).toContain("invalid type");
  });

  it("caches schema resolution (only resolves once)", async () => {
    const toJsonSchema = vi.fn(() => ({ type: "object" }));
    const schema = createMockSchema((input) => ({ value: input }), {
      toJsonSchema,
    });

    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["{}"]));

    const stream = new StructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: ENDPOINT,
    });

    stream.send("first");
    await flushPromises();

    mockFetch.mockResolvedValue(createMockResponse(["{}"]));
    stream.send("second");
    await flushPromises();

    expect(toJsonSchema).toHaveBeenCalledTimes(1);
  });
});
