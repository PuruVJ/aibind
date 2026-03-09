/**
 * NDJSON agent stream protocol.
 *
 * Server-side: consumes AI SDK's `fullStream` and produces NDJSON events.
 * Client-side: parses NDJSON response into typed {@link AgentStreamEvent}s.
 */

// --- Event types ---

export type AgentStreamEvent =
  | { type: "text-delta"; text: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      result: unknown;
    }
  | {
      type: "tool-result-error";
      toolCallId: string;
      toolName: string;
      error: string;
    }
  | {
      type: "approval-request";
      approvalId: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | { type: "step-finish"; stepNumber: number }
  /** Emitted by graph agents when execution enters a named node. */
  | { type: "node-enter"; node: string }
  /** Emitted by graph agents when execution exits a named node. */
  | { type: "node-exit"; node: string }
  | { type: "error"; error: string }
  | { type: "done" };

const RE_NEWLINE = /\r?\n/;

/**
 * NDJSON agent stream — server-side creation and client-side consumption.
 *
 * @example
 * ```ts
 * // Server: create NDJSON response from AI SDK fullStream
 * const response = AgentStream.createResponse(result.fullStream);
 *
 * // Client: consume NDJSON response
 * for await (const event of AgentStream.consume(response)) {
 *   if (event.type === "text-delta") console.log(event.text);
 * }
 * ```
 */
export class AgentStream {
  /**
   * Consumes an AI SDK `fullStream` (from `streamText().fullStream`) and
   * returns a streaming Response with NDJSON-encoded agent events.
   */
  static createResponse(
    fullStream: AsyncIterable<{ type: string; [key: string]: unknown }>,
  ): Response {
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const part of fullStream) {
            const event = AgentStream.mapPart(part);
            if (event) {
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
            }
          }
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "done" }) + "\n"),
          );
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "error", error: message }) + "\n",
            ),
          );
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "done" }) + "\n"),
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  /**
   * Consume an NDJSON streaming response and yield typed {@link AgentStreamEvent}s.
   */
  static async *consume(
    response: Response,
  ): AsyncGenerator<AgentStreamEvent, void, undefined> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.search(RE_NEWLINE)) !== -1) {
          const line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(
            newlineIdx + (buffer[newlineIdx] === "\r" ? 2 : 1),
          );

          if (!line.trim()) continue;

          try {
            yield JSON.parse(line) as AgentStreamEvent;
          } catch {
            // Skip unparseable lines
          }
        }
      }

      // Flush remaining
      const final = decoder.decode();
      if (final) buffer += final;
      if (buffer.trim()) {
        try {
          yield JSON.parse(buffer) as AgentStreamEvent;
        } catch {
          // Skip
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Wrap a pre-built `ReadableStream<Uint8Array>` as an NDJSON `Response`.
   * Used by `ServerAgent` graph execution, which builds the stream manually
   * and interleaves node-enter/exit events between AI SDK fullStream events.
   */
  static createGraphResponse(stream: ReadableStream<Uint8Array>): Response {
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  /**
   * Encode a single `AgentStreamEvent` as a UTF-8 NDJSON line.
   * Used by `ServerAgent` to manually enqueue graph lifecycle events.
   */
  static encodeEvent(event: AgentStreamEvent): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(event) + "\n");
  }

  // ─── Helpers ─────────────────────────────────────────────────

  /**
   * Map a single AI SDK `TextStreamPart` to an `AgentStreamEvent`.
   * Returns `null` for event types that are not surfaced to clients.
   *
   * Exposed as a public static so graph runners (e.g. `ServerAgent#runGraph`)
   * can reuse the mapping logic when manually piping individual stream parts.
   */
  static mapPart(
    part: Record<string, unknown>,
  ): AgentStreamEvent | null {
    switch (part.type) {
      case "text-delta":
        return { type: "text-delta", text: part.text as string };

      case "tool-call":
        return {
          type: "tool-call",
          toolCallId: part.toolCallId as string,
          toolName: part.toolName as string,
          args: part.input ?? part.args,
        };

      case "tool-result": {
        const result = part as Record<string, unknown>;
        if (result.error || result.errorText) {
          return {
            type: "tool-result-error",
            toolCallId: result.toolCallId as string,
            toolName: result.toolName as string,
            error: (result.errorText ??
              result.error ??
              "Tool execution failed") as string,
          };
        }
        return {
          type: "tool-result",
          toolCallId: result.toolCallId as string,
          toolName: result.toolName as string,
          result: result.output ?? result.result,
        };
      }

      case "tool-approval-request":
        return {
          type: "approval-request",
          approvalId: part.approvalId as string,
          toolCallId: part.toolCallId as string,
          toolName:
            ((part.toolCall as Record<string, unknown>)?.toolName as string) ??
            "",
          args: (part.toolCall as Record<string, unknown>)?.input,
        };

      case "step-finish":
        return {
          type: "step-finish",
          stepNumber: (part.stepNumber ?? 0) as number,
        };

      default:
        return null;
    }
  }
}
