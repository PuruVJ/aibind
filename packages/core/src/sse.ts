/**
 * SSE (Server-Sent Events) formatting and parsing utilities.
 */

/**
 * Format a single SSE message.
 * Handles multi-line data by splitting on newlines (each gets its own `data:` line).
 */
export function formatSSE(
  id: string | number,
  data: string,
  event?: string,
): string {
  let msg = "";
  if (event) msg += `event: ${event}\n`;
  msg += `id: ${id}\n`;
  // SSE spec: multi-line data needs multiple `data:` lines
  const lines = data.split("\n");
  for (const line of lines) {
    msg += `data: ${line}\n`;
  }
  msg += "\n";
  return msg;
}

/**
 * Format an SSE event with no id (for terminal events like done/stopped/error).
 */
export function formatSSEEvent(event: string, data = ""): string {
  let msg = `event: ${event}\n`;
  msg += `data: ${data}\n`;
  msg += "\n";
  return msg;
}

/** Parsed SSE message. */
export interface SSEMessage {
  id: string;
  data: string;
  event: string;
}

/**
 * Parse an SSE stream from an HTTP Response.
 * Yields one `SSEMessage` per event block (separated by blank lines).
 */
export async function* consumeSSEStream(
  response: Response,
): AsyncGenerator<SSEMessage, void, undefined> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete events (double newline separated)
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const msg = parseSSEBlock(block);
        if (msg) yield msg;
      }
    }

    // Flush remaining
    const final = decoder.decode();
    if (final) buffer += final;
    if (buffer.trim()) {
      const msg = parseSSEBlock(buffer);
      if (msg) yield msg;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * SSE spec: strip exactly one leading space after the colon.
 * "data: hello" → "hello", "data:  world" → " world"
 */
function stripSSEValue(line: string): string {
  const afterColon = line.slice(line.indexOf(":") + 1);
  return afterColon.startsWith(" ") ? afterColon.slice(1) : afterColon;
}

function parseSSEBlock(block: string): SSEMessage | null {
  let id = "";
  let event = "";
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("id:")) {
      id = stripSSEValue(line);
    } else if (line.startsWith("event:")) {
      event = stripSSEValue(line);
    } else if (line.startsWith("data:")) {
      dataLines.push(stripSSEValue(line));
    }
    // Ignore comments (lines starting with :) and unknown fields
  }

  // Skip empty blocks
  if (!id && !event && dataLines.length === 0) return null;

  return {
    id,
    data: dataLines.join("\n"),
    event,
  };
}
