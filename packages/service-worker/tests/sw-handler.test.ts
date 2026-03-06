import { describe, it, expect, vi } from "vitest";
import { createSWHandler } from "../src/sw-handler";
import type { SWFetchEvent } from "../src/sw-handler";
import type { LanguageModel } from "@aibind/core";

// Minimal mock of SWFetchEvent — enough for routing tests
function makeSWFetchEvent(url: string, init?: RequestInit) {
  const respondWith = vi.fn();
  const waitUntil = vi.fn();
  const event = {
    request: new Request(url, init),
    respondWith,
    waitUntil,
  };
  return { event, respondWith, waitUntil };
}

// A dummy model object. Not called in these routing tests because invalid
// prompts return 400 before reaching the model.
const dummyModel = {} as unknown as LanguageModel;

describe("createSWHandler — routing", () => {
  it("ignores requests that don't match the prefix", () => {
    const handler = createSWHandler({ model: dummyModel });
    const { event, respondWith } = makeSWFetchEvent("http://localhost/api/other");

    handler(event as unknown as SWFetchEvent);

    expect(respondWith).not.toHaveBeenCalled();
  });

  it("ignores requests to a sub-path of another prefix", () => {
    const handler = createSWHandler({
      model: dummyModel,
      prefix: "/__aibind__",
    });
    const { event, respondWith } = makeSWFetchEvent(
      "http://localhost/__other__/stream",
    );

    handler(event as unknown as SWFetchEvent);

    expect(respondWith).not.toHaveBeenCalled();
  });

  it("handles POST to /__aibind__/stream", async () => {
    const handler = createSWHandler({ model: dummyModel });
    const { event, respondWith, waitUntil } = makeSWFetchEvent(
      "http://localhost/__aibind__/stream",
      {
        method: "POST",
        body: JSON.stringify({ prompt: "" }), // empty prompt → 400 before model
      },
    );

    handler(event as unknown as SWFetchEvent);

    expect(respondWith).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();

    // Resolve the response and verify it's a real Response
    const response = await (respondWith.mock.calls[0][0] as Promise<Response>);
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(400);
  });

  it("handles requests with a custom prefix", async () => {
    const handler = createSWHandler({
      model: dummyModel,
      prefix: "/ai",
    });
    const { event: matchEvent, respondWith: respondWithMatch } = makeSWFetchEvent(
      "http://localhost/ai/stream",
      { method: "POST", body: JSON.stringify({ prompt: "" }) },
    );
    const { event: noMatchEvent, respondWith: respondWithNoMatch } =
      makeSWFetchEvent("http://localhost/__aibind__/stream", {
        method: "POST",
        body: JSON.stringify({ prompt: "" }),
      });

    handler(matchEvent as unknown as SWFetchEvent);
    handler(noMatchEvent as unknown as SWFetchEvent);

    expect(respondWithMatch).toHaveBeenCalledOnce();
    expect(respondWithNoMatch).not.toHaveBeenCalled();
  });

  it("handles GET to /__aibind__/stream/resume (resumable=false → 400)", async () => {
    const handler = createSWHandler({ model: dummyModel });
    const { event, respondWith } = makeSWFetchEvent(
      "http://localhost/__aibind__/stream/resume?id=abc&after=0",
    );

    handler(event as unknown as SWFetchEvent);

    expect(respondWith).toHaveBeenCalledOnce();

    const response = await (respondWith.mock.calls[0][0] as Promise<Response>);
    expect(response.status).toBe(404); // route not registered when resumable=false
  });

  it("calls waitUntil to keep the SW alive", () => {
    const handler = createSWHandler({ model: dummyModel });
    const { event, waitUntil } = makeSWFetchEvent(
      "http://localhost/__aibind__/stream",
      { method: "POST", body: JSON.stringify({ prompt: "" }) },
    );

    handler(event as unknown as SWFetchEvent);

    // waitUntil must be called with a Promise
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
  });
});

describe("createSWHandler — non-aibind routes pass through", () => {
  it.each([
    "http://localhost/",
    "http://localhost/favicon.ico",
    "http://localhost/api/users",
    "http://localhost/__aibind", // prefix without trailing slash
  ])("ignores %s", (url) => {
    const handler = createSWHandler({ model: dummyModel });
    const { event, respondWith } = makeSWFetchEvent(url);
    handler(event as unknown as SWFetchEvent);
    expect(respondWith).not.toHaveBeenCalled();
  });
});
