/**
 * Shared test utilities for mocking fetch responses with streaming.
 */

/** Create a mock Response with a ReadableStream body that yields the given chunks. */
export function createMockResponse(chunks: string[], status = 200): Response {
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

/** Create a mock error Response (non-ok status, no streaming body). */
export function createErrorResponse(
  status: number,
  message = "Error",
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    statusText: message,
    headers: { "Content-Type": "application/json" },
  });
}

/** Flush pending microtasks (await all resolved promises). */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Create a mock SSE Response mimicking a resumable stream. */
export function createSSEResponse(
  chunks: string[],
  options?: {
    streamId?: string;
    stopped?: boolean;
    error?: string;
  },
): Response {
  const { streamId = "test-stream-id", stopped = false, error } = options ?? {};
  let sseText = `event: stream-id\nid: ${streamId}\ndata: ${streamId}\n\n`;

  chunks.forEach((chunk, i) => {
    sseText += `id: ${i + 1}\ndata: ${chunk}\n\n`;
  });

  if (error) {
    sseText += `event: error\ndata: ${error}\n\n`;
  }
  if (stopped) {
    sseText += `event: stopped\ndata: \n\n`;
  }
  sseText += `event: done\ndata: \n\n`;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sseText));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "X-Stream-Id": streamId,
    },
  });
}
