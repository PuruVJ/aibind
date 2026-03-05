# @aibind/markdown

Standalone streaming markdown parser and renderer. Framework-agnostic core with zero runtime dependencies. Solves the "Flash of Incomplete Markdown" (FOIM) problem — unterminated bold, partial code blocks, and split links render gracefully during AI streaming.

## Features

- **O(n) incremental parsing** — only new/active blocks are parsed
- **Markdown recovery** — closes unterminated syntax so partial output renders cleanly
- **Pluggable renderer** — bring your own renderer, core never touches the DOM
- **Zero dependencies** — core parser + HTML renderer in ~16 KB (< 3 KB brotli)
- **XSS-safe** — HTML entities escaped by default

## Install

```bash
npm install @aibind/markdown
```

## Usage

````ts
import { StreamParser, HtmlRenderer, MarkdownRecovery } from "@aibind/markdown";

const renderer = new HtmlRenderer();
const parser = new StreamParser(renderer);

parser.write("# Hello\n\nThis is **bold** text.\n\n```js\nconst x = 1;\n```");
parser.end();

renderer.html; // full HTML string
````

### With markdown recovery (for in-progress streams)

```ts
const text = "# Title\n\nSome **bold text that is not yet";
const recovered = MarkdownRecovery.recover(text);

const renderer = new HtmlRenderer();
const parser = new StreamParser(renderer);
parser.write(recovered);
parser.end();
renderer.html; // clean HTML with closed tags
```

## Framework Components

Each framework package provides a reactive component/hook:

| Package                   | Import              | Usage                                                              |
| ------------------------- | ------------------- | ------------------------------------------------------------------ |
| `@aibind/svelte/markdown` | `StreamMarkdown`    | `<StreamMarkdown text={stream.text} streaming={stream.loading} />` |
| `@aibind/vue/markdown`    | `StreamMarkdown`    | `<StreamMarkdown :text="text" :streaming="loading" />`             |
| `@aibind/solid/markdown`  | `useStreamMarkdown` | `const html = useStreamMarkdown(() => text(), () => streaming())`  |
| `@aibind/react/markdown`  | `StreamMarkdown`    | `<StreamMarkdown text={text} streaming={loading} />`               |

## Documentation

Full documentation: **[aibind.dev](https://aibind.dev)**

- [Markdown Rendering](https://aibind.dev/concepts/markdown)

## License

MIT
