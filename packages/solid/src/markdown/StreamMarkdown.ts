import { createMemo } from "solid-js";
import type { Accessor } from "solid-js";
import { StreamParser, HtmlRenderer, MarkdownRecovery } from "@aibind/markdown";

export interface StreamMarkdownProps {
  /** The markdown text to render. Can grow over time during streaming. */
  text: string;
  /** Whether the text is still streaming. Enables recovery for unterminated syntax. */
  streaming?: boolean;
  /** CSS class for the wrapper element. */
  class?: string;
}

/**
 * Reactive hook that returns parsed HTML from streaming markdown.
 * SSR-safe — works on both server and client.
 *
 * @example
 * ```tsx
 * const html = useStreamMarkdown(() => stream.text, () => stream.loading);
 * return <div class="stream-markdown" innerHTML={html()} />;
 * ```
 */
export function useStreamMarkdown(
  getText: () => string,
  getStreaming?: () => boolean,
): Accessor<string> {
  const renderer = new HtmlRenderer();
  const parser = new StreamParser(renderer);

  return createMemo(() => {
    const text = getText();
    const streaming = getStreaming?.() ?? false;
    const input = streaming ? MarkdownRecovery.recover(text) : text;
    renderer.reset();
    parser.reset();
    parser.write(input);
    parser.end();
    return renderer.html;
  });
}
