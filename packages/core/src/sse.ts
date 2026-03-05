/**
 * SSE (Server-Sent Events) formatting and parsing.
 */

/** Parsed SSE message. */
export interface SSEMessage {
  id: string;
  data: string;
  event: string;
}

/**
 * SSE formatting and parsing utilities.
 *
 * @example
 * ```ts
 * // Server-side: format SSE messages
 * const msg = SSE.format(1, "Hello world");
 * const evt = SSE.formatEvent("done");
 *
 * // Client-side: consume SSE response
 * for await (const msg of SSE.consume(response)) {
 *   console.log(msg.event, msg.data);
 * }
 * ```
 */
export class SSE {
  /**
   * Format a single SSE message.
   * Handles multi-line data by splitting on newlines (each gets its own `data:` line).
   */
  static format(id: string | number, data: string, event?: string): string {
    let msg = "";
    if (event) msg += `event: ${event}\n`;
    msg += `id: ${id}\n`;
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
  static formatEvent(event: string, data = ""): string {
    let msg = `event: ${event}\n`;
    msg += `data: ${data}\n`;
    msg += "\n";
    return msg;
  }

  /**
   * Parse an SSE stream from an HTTP Response.
   * Yields one {@link SSEMessage} per event block (separated by blank lines).
   */
  static async *consume(
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

        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const msg = SSE.#parseBlock(block);
          if (msg) yield msg;
        }
      }

      // Flush remaining
      const final = decoder.decode();
      if (final) buffer += final;
      if (buffer.trim()) {
        const msg = SSE.#parseBlock(buffer);
        if (msg) yield msg;
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ─── Private Helpers ────────────────────────────────────────

  /**
   * SSE spec: strip exactly one leading space after the colon.
   * "data: hello" → "hello", "data:  world" → " world"
   */
  static #stripValue(line: string): string {
    const afterColon = line.slice(line.indexOf(":") + 1);
    return afterColon.startsWith(" ") ? afterColon.slice(1) : afterColon;
  }

  static #parseBlock(block: string): SSEMessage | null {
    let id = "";
    let event = "";
    const dataLines: string[] = [];

    for (const line of block.split("\n")) {
      if (line.startsWith("id:")) {
        id = SSE.#stripValue(line);
      } else if (line.startsWith("event:")) {
        event = SSE.#stripValue(line);
      } else if (line.startsWith("data:")) {
        dataLines.push(SSE.#stripValue(line));
      }
    }

    if (!id && !event && dataLines.length === 0) return null;

    return { id, data: dataLines.join("\n"), event };
  }
}
