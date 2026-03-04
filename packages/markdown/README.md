# @aibind/markdown

Standalone streaming markdown parser and renderer. Framework-agnostic core with zero runtime dependencies. Solves the "Flash of Incomplete Markdown" (FOIM) problem — unterminated bold, partial code blocks, and split links render gracefully during AI streaming.

## Features

🚀 **O(n) incremental parsing** — Block-level: only new blocks are parsed. Inline-level: only the active block is re-rendered. Never re-parses completed blocks.
🩹 **Markdown recovery** — Detects and closes unterminated syntax (unclosed bold, code blocks, links, etc.) so partial output always renders cleanly.
🔌 **Renderer interface** — Bring your own renderer. Core never touches the DOM.
📦 **Zero dependencies** — Core parser + HTML renderer in ~16 KB (< 3 KB brotli).
🛡️ **XSS-safe** — HTML entities escaped by default. Safe for `innerHTML` / `{@html}`.

## Install

```bash
npm install @aibind/markdown
```

## Usage

````ts
import { StreamParser, HtmlRenderer, MarkdownRecovery } from "@aibind/markdown";

const renderer = new HtmlRenderer();
const parser = new StreamParser(renderer);

// Feed chunks as they arrive from AI stream
parser.write("# Hello\n\nThis is **bold");
parser.write("** and more text.\n\n```js\nconst x = 1;\n```");
parser.end();

renderer.html; // full HTML string
````

### With markdown recovery (for in-progress streams)

```ts
const text = "# Title\n\nSome **bold text that is not yet";
const recovered = MarkdownRecovery.recover(text);
// → '# Title\n\nSome **bold text that is not yet**'

const renderer = new HtmlRenderer();
const parser = new StreamParser(renderer);
parser.write(recovered);
parser.end();
renderer.html; // clean HTML with closed tags
```

## API

### `StreamParser`

Incremental streaming markdown parser. Feed chunks of markdown text and it emits tokens to the attached renderer.

```ts
const parser = new StreamParser(renderer);
parser.write(chunk); // feed a chunk of markdown
parser.end(); // flush remaining content
```

### `HtmlRenderer`

Built-in renderer that produces an HTML string from parser tokens.

```ts
const renderer = new HtmlRenderer();
// ... use with StreamParser ...
renderer.html; // accumulated HTML string
renderer.reset(); // clear and start over
```

### `MarkdownRecovery`

Static utility that detects and closes unterminated markdown syntax.

```ts
MarkdownRecovery.recover(text); // returns text with closed delimiters
```

Handles: unclosed code fences, bold (`**`), italic (`*`), strikethrough (`~~`), inline code (`` ` ``).

### `Renderer` (abstract)

Base class for custom renderers. Implement these methods:

```ts
class MyRenderer extends Renderer {
  open(token: Token): void {} // element opened (heading, paragraph, etc.)
  close(token: Token): void {} // element closed
  text(content: string): void {} // text content
  attr(key: string, value: string): void {} // attribute (href, src, etc.)
}
```

## Supported Markdown

- Headings (h1–h6)
- Paragraphs with hard line breaks (trailing `  `)
- **Bold**, _italic_, ~~strikethrough~~, `inline code`
- Nested bold/italic (`***bold italic***`)
- Code blocks with language tag
- Links `[text](url)` and images `![alt](src)`
- Unordered and ordered lists
- Blockquotes
- Horizontal rules
- Nested blockquotes and lists

## Framework Components

Each framework package re-exports the core and provides a reactive component/hook:

| Package                       | Import              | Component                                                          |
| ----------------------------- | ------------------- | ------------------------------------------------------------------ |
| `@aibind/svelte/markdown`     | `StreamMarkdown`    | `<StreamMarkdown text={stream.text} streaming={stream.loading} />` |
| `@aibind/sveltekit/markdown`  | `StreamMarkdown`    | Same as svelte                                                     |
| `@aibind/vue/markdown`        | `StreamMarkdown`    | `<StreamMarkdown :text="text" :streaming="loading" />`             |
| `@aibind/nuxt/markdown`       | `StreamMarkdown`    | Same as vue                                                        |
| `@aibind/solid/markdown`      | `useStreamMarkdown` | `const html = useStreamMarkdown(() => text(), () => streaming())`  |
| `@aibind/solidstart/markdown` | `useStreamMarkdown` | Same as solid                                                      |

## License

MIT
