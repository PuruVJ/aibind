#!/usr/bin/env node

/**
 * Measures raw, minified, and brotli-compressed sizes of each package's dist output.
 * Writes results to sizes.json at the repo root.
 *
 * Usage: node scripts/measure-sizes.js
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { brotliCompressSync, constants } from "node:zlib";
import { join, relative } from "node:path";
import { minify } from "terser";

const ROOT = new URL("..", import.meta.url).pathname;
const PACKAGES_DIR = join(ROOT, "packages");
const OUTPUT = join(ROOT, "sizes.json");

async function getFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getFiles(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

function brotliSize(buffer) {
  const compressed = brotliCompressSync(buffer, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
    },
  });
  return compressed.length;
}

async function minifyCode(code) {
  const result = await minify(code, {
    module: true,
    compress: { passes: 2 },
    mangle: true,
  });
  return result.code || "";
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} kB`;
}

async function measurePackage(pkgDir) {
  const pkgJson = JSON.parse(
    await readFile(join(pkgDir, "package.json"), "utf8"),
  );
  const name = pkgJson.name;
  const distDir = join(pkgDir, "dist");

  try {
    await stat(distDir);
  } catch {
    return null;
  }

  const files = await getFiles(distDir);
  const jsFiles = files.filter(
    (f) => f.endsWith(".js") || f.endsWith(".cjs") || f.endsWith(".mjs"),
  );
  const dtsFiles = files.filter(
    (f) => f.endsWith(".d.ts") || f.endsWith(".d.cts") || f.endsWith(".d.mts"),
  );

  let esmRaw = 0;
  let esmMin = 0;
  let esmBrotli = 0;
  const entryDetails = {};

  for (const file of jsFiles) {
    // Only track ESM (.js) for the main size metric
    if (!file.endsWith(".js") || file.endsWith(".cjs")) continue;

    const code = await readFile(file, "utf8");
    const raw = Buffer.byteLength(code);
    const minified = await minifyCode(code);
    const min = Buffer.byteLength(minified);
    const br = brotliSize(Buffer.from(minified));

    esmRaw += raw;
    esmMin += min;
    esmBrotli += br;

    const rel = relative(distDir, file);
    entryDetails[rel] = {
      raw: raw,
      min: min,
      brotli: br,
      raw_formatted: formatBytes(raw),
      min_formatted: formatBytes(min),
      brotli_formatted: formatBytes(br),
    };
  }

  return {
    name,
    esm: {
      raw: esmRaw,
      min: esmMin,
      brotli: esmBrotli,
      raw_formatted: formatBytes(esmRaw),
      min_formatted: formatBytes(esmMin),
      brotli_formatted: formatBytes(esmBrotli),
    },
    js_files: jsFiles.length,
    dts_files: dtsFiles.length,
    entries: entryDetails,
  };
}

async function main() {
  const pkgDirs = await readdir(PACKAGES_DIR, { withFileTypes: true });
  const results = {};
  const skipped = [];

  console.log();
  console.log("  Package                    raw        min     brotli");
  console.log("  " + "─".repeat(55));

  for (const entry of pkgDirs.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const pkgDir = join(PACKAGES_DIR, entry.name);

    try {
      await stat(join(pkgDir, "package.json"));
    } catch {
      continue;
    }

    const result = await measurePackage(pkgDir);
    if (result) {
      results[result.name] = result;
      console.log(
        `  ${result.name.padEnd(25)} ${result.esm.raw_formatted.padStart(8)} → ${result.esm.min_formatted.padStart(8)} → ${result.esm.brotli_formatted.padStart(8)}`,
      );
    } else {
      skipped.push(entry.name);
    }
  }

  if (skipped.length) {
    console.log(`\n  Skipped (no dist/): ${skipped.join(", ")}`);
  }

  const output = {
    generated_at: new Date().toISOString(),
    packages: results,
  };

  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n");
  console.log(`\n  Written to sizes.json\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
