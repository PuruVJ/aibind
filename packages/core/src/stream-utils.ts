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

const RE_TRAILING_COMMA = /,\s*$/;

/**
 * Attempt to parse potentially incomplete JSON into a partial object.
 * Tries to repair unclosed strings, arrays, and objects.
 */
export function parsePartialJSON<T>(text: string): Partial<T> | null {
  // First try as-is
  try {
    return JSON.parse(text) as T;
  } catch {
    // Try to repair
  }

  let repaired = text.trim();
  if (!repaired) return null;

  // Track nesting state
  let inString = false;
  let escape = false;
  let openBraces = 0;
  let openBrackets = 0;

  for (const char of repaired) {
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\" && inString) {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") openBraces++;
    if (char === "}") openBraces--;
    if (char === "[") openBrackets++;
    if (char === "]") openBrackets--;
  }

  // Close unclosed string
  if (inString) repaired += '"';

  // Remove trailing comma before closing
  repaired = repaired.replace(RE_TRAILING_COMMA, "");

  // Close unclosed braces/brackets
  for (let i = 0; i < openBrackets; i++) repaired += "]";
  for (let i = 0; i < openBraces; i++) repaired += "}";

  try {
    return JSON.parse(repaired) as Partial<T>;
  } catch {
    return null;
  }
}
