/**
 * Consume a streaming HTTP response body as async string chunks.
 */
export async function* consumeTextStream(
  response: Response,
): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    // Flush remaining bytes
    const final = decoder.decode();
    if (final) yield final;
  } finally {
    reader.releaseLock();
  }
}
