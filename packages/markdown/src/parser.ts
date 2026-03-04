import type { Token } from "./tokens.js";
import { Renderer } from "./tokens.js";

// charCode constants
const CHAR_SPACE = 32;
const CHAR_TAB = 9;
const CHAR_HASH = 35;
const CHAR_GT = 62;
const CHAR_BACKTICK = 96;
const CHAR_TILDE = 126;
const CHAR_STAR = 42;
const CHAR_DASH = 45;
const CHAR_UNDERSCORE = 95;
const CHAR_PLUS = 43;
const CHAR_DOT = 46;
const CHAR_PAREN_CLOSE = 41;
const CHAR_0 = 48;
const CHAR_9 = 57;

// Fast lookup: special inline chars (\ ! [ ` * _ ~)
const INLINE_SPECIAL = new Uint8Array(128);
INLINE_SPECIAL[92] = 1; // backslash
INLINE_SPECIAL[33] = 1; // !
INLINE_SPECIAL[91] = 1; // [
INLINE_SPECIAL[96] = 1; // `
INLINE_SPECIAL[42] = 1; // *
INLINE_SPECIAL[95] = 1; // _
INLINE_SPECIAL[126] = 1; // ~

// Fast lookup: chars that can start a block-level construct
const BLOCK_START = new Uint8Array(128);
BLOCK_START[CHAR_HASH] = 1;
BLOCK_START[CHAR_BACKTICK] = 1;
BLOCK_START[CHAR_TILDE] = 1;
BLOCK_START[CHAR_GT] = 1;
BLOCK_START[CHAR_STAR] = 1;
BLOCK_START[CHAR_DASH] = 1;
BLOCK_START[CHAR_UNDERSCORE] = 1;
BLOCK_START[CHAR_PLUS] = 1;
BLOCK_START[CHAR_SPACE] = 1;
BLOCK_START[CHAR_TAB] = 1;
for (let i = CHAR_0; i <= CHAR_9; i++) BLOCK_START[i] = 1;

// Fast lookup: whitespace for leading indent
const IS_INDENT = new Uint8Array(128);
IS_INDENT[CHAR_SPACE] = 1;
IS_INDENT[CHAR_TAB] = 1;

// --- Pre-allocated token singletons ---
const EMPTY_ATTRS: Record<string, string> = Object.freeze({});
const T_PARAGRAPH: Token = Object.freeze({
  type: "paragraph",
  attrs: EMPTY_ATTRS,
});
const T_STRONG: Token = Object.freeze({ type: "strong", attrs: EMPTY_ATTRS });
const T_EMPHASIS: Token = Object.freeze({
  type: "emphasis",
  attrs: EMPTY_ATTRS,
});
const T_STRIKETHROUGH: Token = Object.freeze({
  type: "strikethrough",
  attrs: EMPTY_ATTRS,
});
const T_CODE: Token = Object.freeze({ type: "code", attrs: EMPTY_ATTRS });
const T_LIST_ITEM: Token = Object.freeze({
  type: "list_item",
  attrs: EMPTY_ATTRS,
});
const T_HR: Token = Object.freeze({ type: "hr", attrs: EMPTY_ATTRS });
const T_BLOCKQUOTE: Token = Object.freeze({
  type: "blockquote",
  attrs: EMPTY_ATTRS,
});
const T_ORDERED_LIST: Token = Object.freeze({
  type: "ordered_list",
  attrs: EMPTY_ATTRS,
});
const T_UNORDERED_LIST: Token = Object.freeze({
  type: "unordered_list",
  attrs: EMPTY_ATTRS,
});
const T_LINE_BREAK: Token = Object.freeze({
  type: "line_break",
  attrs: EMPTY_ATTRS,
});

// Heading tokens cached by level (1-6)
const T_HEADING: Token[] = [];
for (let i = 0; i <= 6; i++) {
  T_HEADING[i] = Object.freeze({
    type: "heading",
    attrs: Object.freeze({ level: String(i) }),
  });
}

// Reusable list result object (mutated in place to avoid allocation)
const _list = {
  type: "unordered_list" as "ordered_list" | "unordered_list",
  indent: 0,
  contentStart: 0,
};

/**
 * Incremental streaming markdown parser.
 *
 * Processes markdown in chunks, emitting renderer callbacks as blocks
 * are detected and completed. Only new blocks are parsed — completed
 * blocks are never re-processed (O(n) complexity).
 *
 * @example
 * ```ts
 * const renderer = new HtmlRenderer();
 * const parser = new StreamParser(renderer);
 * parser.write('# Hello\n\nSome **bold** text');
 * parser.end();
 * console.log(renderer.html);
 * ```
 */
export class StreamParser {
  #renderer: Renderer;
  #buffer = "";
  #inCodeBlock = false;
  #codeFence = "";
  #codeLanguage = "";
  #inBlockquote = false;
  #listStack: ("ordered_list" | "unordered_list")[] = [];
  #listIndents: number[] = [];
  #inParagraph = false;
  #pendingLineBreak = false;
  #ended = false;

  constructor(renderer: Renderer) {
    this.#renderer = renderer;
  }

  /** Feed a chunk of markdown text. Can be called repeatedly as chunks arrive. */
  write(chunk: string) {
    if (this.#ended) {
      throw new Error("@aibind/markdown: Cannot write after end()");
    }
    this.#buffer += chunk;
    this.#processBuffer();
  }

  /** Signal end of input. Flushes any remaining content. */
  end() {
    if (this.#ended) return;
    this.#ended = true;

    if (this.#buffer.length > 0) {
      this.#processLine(this.#buffer);
      this.#buffer = "";
    }

    if (this.#inCodeBlock) {
      this.#renderer.close({
        type: "code_block",
        attrs: { lang: this.#codeLanguage },
      });
      this.#inCodeBlock = false;
    }
    this.#closeOpenBlocks();
  }

  /** Reset the parser to its initial state for reuse. */
  reset() {
    this.#buffer = "";
    this.#inCodeBlock = false;
    this.#codeFence = "";
    this.#codeLanguage = "";
    this.#inBlockquote = false;
    this.#listStack.length = 0;
    this.#listIndents.length = 0;
    this.#inParagraph = false;
    this.#pendingLineBreak = false;
    this.#ended = false;
  }

  // --- Block state management ---

  #closeParagraph() {
    if (this.#inParagraph) {
      this.#inParagraph = false;
      this.#pendingLineBreak = false;
      this.#renderer.close(T_PARAGRAPH);
    }
  }

  #closeAllLists() {
    while (this.#listStack.length > 0) {
      this.#renderer.close(T_LIST_ITEM);
      const listType = this.#listStack.pop()!;
      this.#renderer.close(
        listType === "ordered_list" ? T_ORDERED_LIST : T_UNORDERED_LIST,
      );
    }
    this.#listIndents.length = 0;
  }

  #closeBlockquote() {
    if (this.#inBlockquote) {
      this.#closeParagraph();
      this.#inBlockquote = false;
      this.#renderer.close(T_BLOCKQUOTE);
    }
  }

  #closeOpenBlocks() {
    this.#closeParagraph();
    this.#closeAllLists();
    this.#closeBlockquote();
  }

  // --- Helpers ---

  #findClosingSingle(
    text: string,
    char: string,
    start: number,
    end: number,
  ): number {
    const double = char + char;
    let i = start;
    while (i < end) {
      if (text[i] === char) {
        if (text[i + 1] === char) {
          const closeDouble = text.indexOf(double, i + 2);
          if (closeDouble !== -1 && closeDouble < end) {
            i = closeDouble + 2;
            continue;
          }
          return i;
        }
        return i;
      }
      i++;
    }
    return -1;
  }

  // --- Inline parsing (offset-based, no slicing for recursion) ---

  #parseInline(text: string, start = 0, end = text.length) {
    const r = this.#renderer;
    let i = start;

    while (i < end) {
      if (text[i] === "\\" && i + 1 < end) {
        r.text(text[i + 1]);
        i += 2;
        continue;
      }

      if (text[i] === "!" && text[i + 1] === "[") {
        const altEnd = text.indexOf("]", i + 2);
        if (altEnd !== -1 && altEnd < end && text[altEnd + 1] === "(") {
          const srcEnd = text.indexOf(")", altEnd + 2);
          if (srcEnd !== -1 && srcEnd < end) {
            const alt = text.substring(i + 2, altEnd);
            const src = text.substring(altEnd + 2, srcEnd);
            const tok: Token = { type: "image", attrs: { src, alt } };
            r.open(tok);
            r.close(tok);
            i = srcEnd + 1;
            continue;
          }
        }
      }

      if (text[i] === "[") {
        const textEnd = text.indexOf("]", i + 1);
        if (textEnd !== -1 && textEnd < end && text[textEnd + 1] === "(") {
          const urlEnd = text.indexOf(")", textEnd + 2);
          if (urlEnd !== -1 && urlEnd < end) {
            const href = text.substring(textEnd + 2, urlEnd);
            const tok: Token = { type: "link", attrs: { href } };
            r.open(tok);
            r.text(text.substring(i + 1, textEnd));
            r.close(tok);
            i = urlEnd + 1;
            continue;
          }
        }
      }

      if (text[i] === "`") {
        let backticks = 1;
        while (i + backticks < end && text[i + backticks] === "`") backticks++;
        if (backticks <= 2) {
          const delimiter = backticks === 1 ? "`" : "``";
          const closeIdx = text.indexOf(delimiter, i + backticks);
          if (closeIdx !== -1 && closeIdx < end) {
            r.open(T_CODE);
            r.text(text.substring(i + backticks, closeIdx));
            r.close(T_CODE);
            i = closeIdx + backticks;
            continue;
          }
        }
      }

      if (text[i] === "~" && text[i + 1] === "~") {
        const closeIdx = text.indexOf("~~", i + 2);
        if (closeIdx !== -1 && closeIdx < end) {
          r.open(T_STRIKETHROUGH);
          this.#parseInline(text, i + 2, closeIdx);
          r.close(T_STRIKETHROUGH);
          i = closeIdx + 2;
          continue;
        }
      }

      if (
        (text[i] === "*" && text[i + 1] === "*") ||
        (text[i] === "_" && text[i + 1] === "_")
      ) {
        const delim = text[i] === "*" ? "**" : "__";
        const closeIdx = text.indexOf(delim, i + 2);
        if (closeIdx !== -1 && closeIdx < end) {
          r.open(T_STRONG);
          this.#parseInline(text, i + 2, closeIdx);
          r.close(T_STRONG);
          i = closeIdx + 2;
          continue;
        }
      }

      if (text[i] === "*" || text[i] === "_") {
        const delim = text[i];
        const closeIdx = this.#findClosingSingle(text, delim, i + 1, end);
        if (closeIdx !== -1 && closeIdx > i + 1) {
          r.open(T_EMPHASIS);
          this.#parseInline(text, i + 1, closeIdx);
          r.close(T_EMPHASIS);
          i = closeIdx + 1;
          continue;
        }
      }

      // Plain text — collect until next special character
      let textEnd = i + 1;
      while (textEnd < end) {
        const code = text.charCodeAt(textEnd);
        if (code < 128 && INLINE_SPECIAL[code]) break;
        textEnd++;
      }
      r.text(text.substring(i, textEnd));
      i = textEnd;
    }
  }

  // --- Block-level parsing (regex-free for hot paths) ---

  /** Manual list detection — no regex, no array allocation. */
  #detectListItem(line: string, lineLen: number): boolean {
    // Count leading whitespace
    let indent = 0;
    while (indent < lineLen) {
      const c = line.charCodeAt(indent);
      if (c !== CHAR_SPACE && c !== CHAR_TAB) break;
      indent++;
    }
    if (indent >= lineLen) return false;

    const ch = line.charCodeAt(indent);

    // Unordered list: -, *, + followed by space
    if (
      (ch === CHAR_DASH || ch === CHAR_STAR || ch === CHAR_PLUS) &&
      indent + 1 < lineLen &&
      line.charCodeAt(indent + 1) === CHAR_SPACE
    ) {
      _list.type = "unordered_list";
      _list.indent = indent;
      _list.contentStart = indent + 2;
      return true;
    }

    // Ordered list: digits followed by . or ) then space
    if (ch >= CHAR_0 && ch <= CHAR_9) {
      let numEnd = indent + 1;
      while (
        numEnd < lineLen &&
        line.charCodeAt(numEnd) >= CHAR_0 &&
        line.charCodeAt(numEnd) <= CHAR_9
      )
        numEnd++;
      if (numEnd < lineLen) {
        const after = line.charCodeAt(numEnd);
        if (
          (after === CHAR_DOT || after === CHAR_PAREN_CLOSE) &&
          numEnd + 1 < lineLen &&
          line.charCodeAt(numEnd + 1) === CHAR_SPACE
        ) {
          _list.type = "ordered_list";
          _list.indent = indent;
          _list.contentStart = numEnd + 2;
          return true;
        }
      }
    }

    return false;
  }

  /** Manual heading detection — no regex. Returns level (1-6) or 0. */
  #detectHeading(line: string, lineLen: number): number {
    let level = 0;
    while (level < lineLen && level < 6 && line.charCodeAt(level) === CHAR_HASH)
      level++;
    if (
      level > 0 &&
      level <= 6 &&
      level < lineLen &&
      line.charCodeAt(level) === CHAR_SPACE
    ) {
      return level;
    }
    return 0;
  }

  /** Manual HR detection — no regex. */
  #isHorizontalRule(line: string, lineLen: number, firstCode: number): boolean {
    if (
      firstCode !== CHAR_STAR &&
      firstCode !== CHAR_DASH &&
      firstCode !== CHAR_UNDERSCORE
    )
      return false;
    let count = 0;
    for (let j = 0; j < lineLen; j++) {
      const c = line.charCodeAt(j);
      if (c === firstCode) {
        count++;
      } else if (c !== CHAR_SPACE) {
        return false;
      }
    }
    return count >= 3;
  }

  /** Manual code fence detection — no regex. Returns fence string or empty. */
  #detectCodeFence(line: string, lineLen: number): string {
    let indent = 0;
    while (indent < lineLen && line.charCodeAt(indent) === CHAR_SPACE) indent++;
    if (indent >= lineLen) return "";
    const ch = line.charCodeAt(indent);
    if (ch !== CHAR_BACKTICK && ch !== CHAR_TILDE) return "";
    let fenceEnd = indent + 1;
    while (fenceEnd < lineLen && line.charCodeAt(fenceEnd) === ch) fenceEnd++;
    if (fenceEnd - indent >= 3) {
      return line.substring(indent, fenceEnd);
    }
    return "";
  }

  #processLine(line: string) {
    const r = this.#renderer;
    const lineLen = line.length;

    // --- Code block content ---
    if (this.#inCodeBlock) {
      // Check for closing fence
      let trimStart = 0;
      while (trimStart < lineLen && line.charCodeAt(trimStart) === CHAR_SPACE)
        trimStart++;
      const fenceLen = this.#codeFence.length;
      let match = trimStart + fenceLen <= lineLen;
      if (match) {
        for (let k = 0; k < fenceLen; k++) {
          if (
            line.charCodeAt(trimStart + k) !== this.#codeFence.charCodeAt(k)
          ) {
            match = false;
            break;
          }
        }
      }
      if (match) {
        // Check rest is whitespace
        let rest = trimStart + fenceLen;
        while (rest < lineLen && line.charCodeAt(rest) === CHAR_SPACE) rest++;
        if (rest === lineLen) {
          this.#inCodeBlock = false;
          r.close({ type: "code_block", attrs: { lang: this.#codeLanguage } });
          this.#codeFence = "";
          this.#codeLanguage = "";
          return;
        }
      }
      r.text(line + "\n");
      return;
    }

    // --- Empty line fast path ---
    if (lineLen === 0) {
      if (this.#inBlockquote) this.#closeBlockquote();
      if (this.#listStack.length > 0) this.#closeAllLists();
      this.#closeParagraph();
      return;
    }

    const firstCode = line.charCodeAt(0);
    const maybeBlock = firstCode < 128 && BLOCK_START[firstCode];

    if (maybeBlock) {
      // Code fence
      if (
        firstCode === CHAR_BACKTICK ||
        firstCode === CHAR_TILDE ||
        firstCode === CHAR_SPACE
      ) {
        const fence = this.#detectCodeFence(line, lineLen);
        if (fence) {
          this.#closeOpenBlocks();
          this.#inCodeBlock = true;
          this.#codeFence = fence;
          this.#codeLanguage = line
            .substring(line.indexOf(fence) + fence.length)
            .trim();
          r.open({ type: "code_block", attrs: { lang: this.#codeLanguage } });
          return;
        }
      }

      // Heading
      if (firstCode === CHAR_HASH) {
        const level = this.#detectHeading(line, lineLen);
        if (level > 0) {
          this.#closeOpenBlocks();
          const tok = T_HEADING[level];
          r.open(tok);
          this.#parseInline(line, level + 1, lineLen);
          r.close(tok);
          return;
        }
      }

      // Horizontal rule
      if (this.#isHorizontalRule(line, lineLen, firstCode)) {
        this.#closeOpenBlocks();
        r.open(T_HR);
        r.close(T_HR);
        return;
      }

      // Blockquote
      if (firstCode === CHAR_GT) {
        const contentStart =
          lineLen > 1 && line.charCodeAt(1) === CHAR_SPACE ? 2 : 1;
        if (!this.#inBlockquote) {
          this.#closeOpenBlocks();
          this.#inBlockquote = true;
          r.open(T_BLOCKQUOTE);
        }
        if (!this.#inParagraph) {
          this.#inParagraph = true;
          r.open(T_PARAGRAPH);
        }
        this.#parseInline(line, contentStart, lineLen);
        r.text("\n");
        return;
      }

      // List item
      if (this.#detectListItem(line, lineLen)) {
        if (this.#inBlockquote) this.#closeBlockquote();
        this.#closeParagraph();

        const type = _list.type;
        const indent = _list.indent;

        while (
          this.#listStack.length > 0 &&
          this.#listIndents[this.#listIndents.length - 1] > indent
        ) {
          r.close(T_LIST_ITEM);
          const pop = this.#listStack.pop()!;
          r.close(pop === "ordered_list" ? T_ORDERED_LIST : T_UNORDERED_LIST);
          this.#listIndents.pop();
        }

        if (
          this.#listStack.length === 0 ||
          this.#listIndents[this.#listIndents.length - 1] < indent
        ) {
          r.open(type === "ordered_list" ? T_ORDERED_LIST : T_UNORDERED_LIST);
          this.#listStack.push(type);
          this.#listIndents.push(indent);
        } else {
          r.close(T_LIST_ITEM);
        }

        r.open(T_LIST_ITEM);
        this.#parseInline(line, _list.contentStart, lineLen);
        return;
      }
    }

    // Close blockquote if non-blockquote line
    if (this.#inBlockquote) {
      this.#closeBlockquote();
    }

    // Blank line (whitespace only, already handled lineLen===0 above)
    if (lineLen <= 4) {
      let allSpace = true;
      for (let j = 0; j < lineLen; j++) {
        const c = line.charCodeAt(j);
        if (c !== CHAR_SPACE && c !== CHAR_TAB) {
          allSpace = false;
          break;
        }
      }
      if (allSpace) {
        if (this.#listStack.length > 0) this.#closeAllLists();
        this.#closeParagraph();
        return;
      }
    }

    // Close lists if non-list content
    if (this.#listStack.length > 0) {
      this.#closeAllLists();
    }

    // Paragraph (default)
    if (!this.#inParagraph) {
      this.#inParagraph = true;
      r.open(T_PARAGRAPH);
    } else {
      if (this.#pendingLineBreak) {
        this.#pendingLineBreak = false;
        r.open(T_LINE_BREAK);
        r.close(T_LINE_BREAK);
      } else {
        r.text("\n");
      }
    }

    // Check for hard line break (trailing 2+ spaces)
    let contentEnd = lineLen;
    if (
      lineLen >= 2 &&
      line.charCodeAt(lineLen - 1) === CHAR_SPACE &&
      line.charCodeAt(lineLen - 2) === CHAR_SPACE
    ) {
      contentEnd = lineLen - 1;
      while (contentEnd >= 0 && line.charCodeAt(contentEnd) === CHAR_SPACE)
        contentEnd--;
      contentEnd++;
      this.#pendingLineBreak = true;
    }
    this.#parseInline(line, 0, contentEnd);
  }

  #processBuffer() {
    let start = 0;
    const buf = this.#buffer;
    while (true) {
      const newlineIdx = buf.indexOf("\n", start);
      if (newlineIdx === -1) break;
      const line = buf.substring(start, newlineIdx);
      start = newlineIdx + 1;
      this.#processLine(line);
    }
    this.#buffer = start > 0 ? buf.substring(start) : buf;
  }
}
