import { useMemo } from "react";
import { StreamParser, HtmlRenderer, MarkdownRecovery } from "@aibind/markdown";

export interface StreamMarkdownProps {
  /** The markdown text to render. Can grow over time during streaming. */
  text: string;
  /** Whether the text is still streaming. Enables recovery for unterminated syntax. */
  streaming?: boolean;
  /** CSS class for the wrapper element. */
  className?: string;
}

/**
 * React component that renders streaming markdown as HTML.
 *
 * @example
 * ```tsx
 * <StreamMarkdown text={stream.text} streaming={stream.loading} />
 * ```
 */
export function StreamMarkdown({
  text,
  streaming = false,
  className,
}: StreamMarkdownProps): React.JSX.Element {
  const { renderer, parser } = useMemo(() => {
    const r = new HtmlRenderer();
    const p = new StreamParser(r);
    return { renderer: r, parser: p };
  }, []);

  const input = streaming ? MarkdownRecovery.recover(text) : text;
  renderer.reset();
  parser.reset();
  parser.write(input);
  parser.end();

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: renderer.html }}
    />
  );
}
