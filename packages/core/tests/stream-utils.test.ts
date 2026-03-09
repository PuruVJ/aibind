import { describe, it, expect } from "vitest";
import { consumeTextStream } from "../src/index.js";

describe("consumeTextStream", () => {
  it("yields chunks from a ReadableStream", async () => {
    const chunks = ["Hello", " ", "World"];
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    const response = new Response(stream);
    const result: string[] = [];
    for await (const chunk of consumeTextStream(response)) {
      result.push(chunk);
    }

    expect(result.join("")).toBe("Hello World");
  });

  it("handles empty stream", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    const response = new Response(stream);
    const result: string[] = [];
    for await (const chunk of consumeTextStream(response)) {
      result.push(chunk);
    }

    expect(result.join("")).toBe("");
  });

  it("handles stream error mid-read", async () => {
    let enqueueRef: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream({
      start(controller) {
        enqueueRef = controller;
      },
    });

    setTimeout(() => {
      enqueueRef.enqueue(new TextEncoder().encode("hello"));
      enqueueRef.error(new Error("stream broke"));
    }, 0);

    const response = new Response(stream);
    const result: string[] = [];

    await expect(async () => {
      for await (const chunk of consumeTextStream(response)) {
        result.push(chunk);
      }
    }).rejects.toThrow("stream broke");

    expect(result).toEqual(["hello"]);
  });

  it("handles multi-byte UTF-8 characters", async () => {
    const text = "Hello 🌍 World";
    const encoded = new TextEncoder().encode(text);
    const mid = encoded.indexOf(0xf0);
    const chunk1 = encoded.slice(0, mid + 2);
    const chunk2 = encoded.slice(mid + 2);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk1);
        controller.enqueue(chunk2);
        controller.close();
      },
    });

    const response = new Response(stream);
    const result: string[] = [];
    for await (const chunk of consumeTextStream(response)) {
      result.push(chunk);
    }

    expect(result.join("")).toBe(text);
  });
});
