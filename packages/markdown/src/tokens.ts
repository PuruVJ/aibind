/** Token types emitted by the parser. */
export type TokenType =
  // Block-level
  | "document"
  | "heading"
  | "paragraph"
  | "code_block"
  | "blockquote"
  | "ordered_list"
  | "unordered_list"
  | "list_item"
  | "hr"
  // Inline-level
  | "strong"
  | "emphasis"
  | "strikethrough"
  | "code"
  | "link"
  | "image"
  | "line_break";

export interface Token {
  type: TokenType;
  /** Attributes like href, src, alt, lang, level */
  attrs: Record<string, string>;
}

/**
 * Renderer interface — implement this to render parsed markdown
 * into any target (HTML string, DOM nodes, virtual DOM, etc.)
 */
export abstract class Renderer {
  /** A block or inline element has opened. */
  abstract open(token: Token): void;
  /** A block or inline element has closed. */
  abstract close(token: Token): void;
  /** Append text content to the current element. */
  abstract text(content: string): void;
}
