import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Bench } from "tinybench";
import { StreamParser, HtmlRenderer, MarkdownRecovery } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Test documents ---

const SHORT_MD = `# Hello World

This is a **bold** and *italic* paragraph with \`inline code\`.

- Item one
- Item two
- Item three
`;

const MEDIUM_MD = `# Getting Started

Welcome to the **documentation**. This guide covers everything you need.

## Installation

\`\`\`bash
npm install @aibind/markdown
\`\`\`

## Usage

Here's a [link](https://example.com) and an image:

![alt text](https://example.com/img.png)

### Features

1. **Streaming** — incremental parsing
2. **Recovery** — handles unterminated syntax
3. ~~Deprecated~~ features removed

> This is a blockquote with **bold** text
> and multiple lines.

---

Some \`inline code\` and more text with *emphasis* and **strong emphasis**.

\`\`\`typescript
const parser = new StreamParser(renderer);
parser.write('# Hello');
parser.end();
\`\`\`

Final paragraph.
`;

const LONG_MD = Array.from({ length: 50 }, (_, i) => {
  if (i % 10 === 0) return `\n## Section ${i / 10 + 1}\n`;
  if (i % 5 === 0)
    return `\n\`\`\`js\nconst x = ${i};\nconsole.log(x);\n\`\`\`\n`;
  if (i % 3 === 0)
    return `\n> Blockquote line ${i} with **bold** and *italic*.\n`;
  if (i % 4 === 0)
    return `\n- List item ${i} with [link](https://example.com/${i})\n`;
  return `\nParagraph ${i}: This is some text with **bold**, *italic*, \`code\`, and ~~strikethrough~~.\n`;
}).join("");

// --- Helpers ---

function parseComplete(md: string): void {
  const renderer = new HtmlRenderer();
  const parser = new StreamParser(renderer);
  parser.write(md);
  parser.end();
}

function parseChunked(md: string, chunkSize: number): void {
  const renderer = new HtmlRenderer();
  const parser = new StreamParser(renderer);
  for (let i = 0; i < md.length; i += chunkSize) {
    parser.write(md.slice(i, i + chunkSize));
  }
  parser.end();
}

function parseWithRecovery(md: string): void {
  const recovered = MarkdownRecovery.recover(md);
  const renderer = new HtmlRenderer();
  const parser = new StreamParser(renderer);
  parser.write(recovered);
  parser.end();
}

// Reusable instances for reset-based benchmarks
const reusableRenderer = new HtmlRenderer();
const reusableParser = new StreamParser(reusableRenderer);

// --- Benchmark ---

const bench = new Bench({ time: 2000, warmupTime: 500 });

// Full-document parsing
bench.add("parse:short (full)", () => parseComplete(SHORT_MD));
bench.add("parse:medium (full)", () => parseComplete(MEDIUM_MD));
bench.add("parse:long (full)", () => parseComplete(LONG_MD));

// Chunked streaming (simulates AI token-by-token)
bench.add("parse:short (10-char chunks)", () => parseChunked(SHORT_MD, 10));
bench.add("parse:medium (10-char chunks)", () => parseChunked(MEDIUM_MD, 10));
bench.add("parse:long (10-char chunks)", () => parseChunked(LONG_MD, 10));

// Chunked streaming with larger chunks (simulates word-level streaming)
bench.add("parse:medium (50-char chunks)", () => parseChunked(MEDIUM_MD, 50));
bench.add("parse:long (50-char chunks)", () => parseChunked(LONG_MD, 50));

// Recovery
bench.add("recovery:short", () => MarkdownRecovery.recover(SHORT_MD));
bench.add("recovery:medium", () => MarkdownRecovery.recover(MEDIUM_MD));
bench.add("recovery:long", () => MarkdownRecovery.recover(LONG_MD));

// Parse + recovery (realistic streaming scenario)
bench.add("parse+recovery:medium (10-char chunks)", () =>
  parseWithRecovery(MEDIUM_MD),
);
bench.add("parse+recovery:long (10-char chunks)", () =>
  parseWithRecovery(LONG_MD),
);

// Parser+renderer reuse (the fastest path)
bench.add("parse:short (reuse)", () => {
  reusableRenderer.reset();
  reusableParser.reset();
  reusableParser.write(SHORT_MD);
  reusableParser.end();
});
bench.add("parse:medium (reuse)", () => {
  reusableRenderer.reset();
  reusableParser.reset();
  reusableParser.write(MEDIUM_MD);
  reusableParser.end();
});
bench.add("parse:long (reuse)", () => {
  reusableRenderer.reset();
  reusableParser.reset();
  reusableParser.write(LONG_MD);
  reusableParser.end();
});

// HTML renderer reuse (reset vs new) — batch of 100
bench.add("renderer:new each time", () => {
  for (let i = 0; i < 100; i++) {
    const renderer = new HtmlRenderer();
    const parser = new StreamParser(renderer);
    parser.write(SHORT_MD);
    parser.end();
  }
});
bench.add("renderer:reuse with reset", () => {
  const renderer = new HtmlRenderer();
  const parser = new StreamParser(renderer);
  for (let i = 0; i < 100; i++) {
    renderer.reset();
    parser.reset();
    parser.write(SHORT_MD);
    parser.end();
  }
});

await bench.run();

console.log("\n📊 @aibind/markdown Benchmark Results\n");
console.table(bench.table());

// Write results to JSON
const results = bench.tasks.map((task) => {
  const r = task.result as Record<string, any> | undefined;
  const latency = r?.latency as Record<string, number> | undefined;
  const throughput = r?.throughput as Record<string, number> | undefined;
  return {
    name: task.name,
    latency_avg_ns: Math.round((latency?.mean ?? 0) * 1e6),
    latency_med_ns: Math.round((latency?.p50 ?? 0) * 1e6),
    throughput_avg: Math.round(throughput?.mean ?? 0),
    throughput_med: Math.round(throughput?.p50 ?? 0),
    samples: latency?.samplesCount ?? 0,
  };
});

const output = {
  timestamp: new Date().toISOString(),
  runtime: `Node.js ${process.version}`,
  platform: `${process.platform} ${process.arch}`,
  documents: {
    short: { chars: SHORT_MD.length, lines: SHORT_MD.split("\n").length },
    medium: { chars: MEDIUM_MD.length, lines: MEDIUM_MD.split("\n").length },
    long: { chars: LONG_MD.length, lines: LONG_MD.split("\n").length },
  },
  results,
};

const outPath = join(__dirname, "results.json");
writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
console.log(`\nResults written to ${outPath}`);
