#!/usr/bin/env node

import { build } from "tsup";
import { readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { brotliCompressSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tmp = join(root, ".tmp-size");

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const entry = join(tmp, "entry.ts");
writeFileSync(
  entry,
  `export { Stream, StructuredStream, defineModels } from '../src/lib/index.svelte.ts';\n`,
);

console.log("Bundling client code with tsup...\n");

await build({
  entry: [entry],
  format: ["esm"],
  outDir: tmp,
  external: [
    "svelte",
    "@standard-schema/spec",
    "@valibot/to-json-schema",
    "zod/v4",
  ],
  minify: "terser",
  splitting: false,
  treeshake: true,
  silent: true,
});

const bundled = readFileSync(join(tmp, "entry.js"));
const brotli = brotliCompressSync(bundled);

const kb = (bytes) => (bytes / 1024).toFixed(2);

console.log("  svai client bundle size");
console.log("  ─────────────────────────");
console.log(`  Raw (minified): ${kb(bundled.length)} KB`);
console.log(`  Brotli:         ${kb(brotli.length)} KB`);
console.log();

rmSync(tmp, { recursive: true, force: true });
