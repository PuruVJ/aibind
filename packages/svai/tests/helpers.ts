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
		}
	});
	return new Response(stream, { status, statusText: status === 200 ? 'OK' : 'Error' });
}

/** Create a mock error Response (non-ok status, no streaming body). */
export function createErrorResponse(status: number, message = 'Error'): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		statusText: message,
		headers: { 'Content-Type': 'application/json' }
	});
}

/** Flush pending microtasks (await all resolved promises). */
export function flushPromises(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
