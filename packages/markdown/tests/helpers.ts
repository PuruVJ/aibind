import { StreamParser, HtmlRenderer } from "../src/index.js";

/**
 * Parse markdown in a single write and return the HTML output.
 */
export function parse(markdown: string): string {
  const renderer = new HtmlRenderer();
  const parser = new StreamParser(renderer);
  parser.write(markdown);
  parser.end();
  return renderer.html;
}

/**
 * Parse markdown character-by-character (simulating worst-case streaming)
 * and return the HTML output.
 */
export function parseCharByChar(markdown: string): string {
  const renderer = new HtmlRenderer();
  const parser = new StreamParser(renderer);
  for (const char of markdown) {
    parser.write(char);
  }
  parser.end();
  return renderer.html;
}

/**
 * Parse markdown in random-sized chunks and return the HTML output.
 */
export function parseRandomChunks(markdown: string, seed = 42): string {
  const renderer = new HtmlRenderer();
  const parser = new StreamParser(renderer);
  let i = 0;
  let s = seed;
  while (i < markdown.length) {
    // Simple PRNG for deterministic "random" chunk sizes 1-5
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const chunkSize = (s % 5) + 1;
    parser.write(markdown.slice(i, i + chunkSize));
    i += chunkSize;
  }
  parser.end();
  return renderer.html;
}

/**
 * Assert that markdown produces the expected HTML regardless of chunking strategy.
 * This is the gold standard test — every test case MUST produce identical output
 * whether fed all at once, character-by-character, or in random chunks.
 */
export function assertMarkdown(markdown: string, expectedHtml: string) {
  const singleWrite = parse(markdown);
  const charByChar = parseCharByChar(markdown);
  const randomChunks = parseRandomChunks(markdown);

  if (singleWrite !== expectedHtml) {
    throw new Error(
      `Single-write mismatch:\n  Input:    ${JSON.stringify(markdown)}\n  Expected: ${JSON.stringify(expectedHtml)}\n  Got:      ${JSON.stringify(singleWrite)}`,
    );
  }
  if (charByChar !== expectedHtml) {
    throw new Error(
      `Char-by-char mismatch:\n  Input:    ${JSON.stringify(markdown)}\n  Expected: ${JSON.stringify(expectedHtml)}\n  Got:      ${JSON.stringify(charByChar)}`,
    );
  }
  if (randomChunks !== expectedHtml) {
    throw new Error(
      `Random-chunks mismatch:\n  Input:    ${JSON.stringify(markdown)}\n  Expected: ${JSON.stringify(expectedHtml)}\n  Got:      ${JSON.stringify(randomChunks)}`,
    );
  }
}
