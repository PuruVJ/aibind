import { Renderer, type Token } from "../tokens.js";

const RE_HTML_ESCAPE = /[&<>"]/g;
const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/** Escape HTML special characters to prevent XSS. Single-pass replacement. */
function escapeHtml(text: string): string {
  return text.replace(RE_HTML_ESCAPE, (ch) => ESCAPE_MAP[ch]);
}

/**
 * HTML string renderer. Accumulates rendered HTML from parser events.
 *
 * Uses an internal string array and joins on access, reducing GC pressure
 * from repeated string concatenation during streaming.
 *
 * @example
 * ```ts
 * const renderer = new HtmlRenderer();
 * const parser = new StreamParser(renderer);
 * parser.write('# Hello World\n');
 * parser.end();
 * console.log(renderer.html); // '<h1>Hello World</h1>\n'
 * ```
 */
export class HtmlRenderer extends Renderer {
  #parts: string[] = [];
  #dirty = true;
  #cached = "";

  /** Get the accumulated HTML string. */
  get html(): string {
    if (this.#dirty) {
      this.#cached = this.#parts.join("");
      this.#dirty = false;
    }
    return this.#cached;
  }

  /** @internal */
  set html(_: string) {
    // no-op for backwards compat — use reset() instead
  }

  open(token: Token) {
    this.#dirty = true;
    switch (token.type) {
      case "heading": {
        const level = token.attrs.level || "1";
        this.#parts.push(`<h${level}>`);
        break;
      }
      case "paragraph":
        this.#parts.push("<p>");
        break;
      case "code_block": {
        const lang = token.attrs.lang;
        if (lang) {
          this.#parts.push(`<pre><code class="language-${escapeHtml(lang)}">`);
        } else {
          this.#parts.push("<pre><code>");
        }
        break;
      }
      case "blockquote":
        this.#parts.push("<blockquote>");
        break;
      case "ordered_list":
        this.#parts.push("<ol>");
        break;
      case "unordered_list":
        this.#parts.push("<ul>");
        break;
      case "list_item":
        this.#parts.push("<li>");
        break;
      case "hr":
        this.#parts.push("<hr>");
        break;
      case "strong":
        this.#parts.push("<strong>");
        break;
      case "emphasis":
        this.#parts.push("<em>");
        break;
      case "strikethrough":
        this.#parts.push("<del>");
        break;
      case "code":
        this.#parts.push("<code>");
        break;
      case "link":
        this.#parts.push(`<a href="${escapeHtml(token.attrs.href || "")}">`);
        break;
      case "image": {
        const src = escapeHtml(token.attrs.src || "");
        const alt = escapeHtml(token.attrs.alt || "");
        this.#parts.push(`<img src="${src}" alt="${alt}">`);
        break;
      }
      case "line_break":
        this.#parts.push("<br>");
        break;
    }
  }

  close(token: Token) {
    this.#dirty = true;
    switch (token.type) {
      case "heading": {
        const level = token.attrs.level || "1";
        this.#parts.push(`</h${level}>\n`);
        break;
      }
      case "paragraph":
        this.#parts.push("</p>\n");
        break;
      case "code_block":
        this.#parts.push("</code></pre>\n");
        break;
      case "blockquote":
        this.#parts.push("</blockquote>\n");
        break;
      case "ordered_list":
        this.#parts.push("</ol>\n");
        break;
      case "unordered_list":
        this.#parts.push("</ul>\n");
        break;
      case "list_item":
        this.#parts.push("</li>\n");
        break;
      case "strong":
        this.#parts.push("</strong>");
        break;
      case "emphasis":
        this.#parts.push("</em>");
        break;
      case "strikethrough":
        this.#parts.push("</del>");
        break;
      case "code":
        this.#parts.push("</code>");
        break;
      case "link":
        this.#parts.push("</a>");
        break;
      case "hr":
        this.#parts.push("\n");
        break;
    }
  }

  text(content: string) {
    this.#dirty = true;
    this.#parts.push(escapeHtml(content));
  }

  /** Reset the renderer to its initial state. */
  reset() {
    this.#parts.length = 0;
    this.#dirty = true;
    this.#cached = "";
  }
}
