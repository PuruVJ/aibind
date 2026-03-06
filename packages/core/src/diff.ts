import type { DiffChunk, DiffFn } from "./types";

export type { DiffChunk, DiffFn };

// --- Tokenizer ---

const RE_TOKEN_SPLIT = /(\s+)/;

function tokenize(text: string): string[] {
  return text.split(RE_TOKEN_SPLIT).filter((t) => t.length > 0);
}

// --- Merge adjacent same-type chunks ---

function mergeSameType(chunks: DiffChunk[]): DiffChunk[] {
  return chunks.reduce<DiffChunk[]>((acc, chunk) => {
    const last = acc[acc.length - 1];
    if (last && last.type === chunk.type) {
      acc[acc.length - 1] = { type: last.type, text: last.text + chunk.text };
    } else {
      acc.push({ type: chunk.type, text: chunk.text });
    }
    return acc;
  }, []);
}

/**
 * Built-in word-level diff using LCS (Longest Common Subsequence).
 * Zero dependencies. O(m·n) — suitable for typical AI response sizes.
 *
 * For longer texts or richer diff options (sentence-level, semantic cleanup,
 * character-level), plug in the `diff` npm package via the `diff` option:
 *
 * ```ts
 * import { diffWords } from "diff";
 * new Stream({ diff: (p, n) => diffWords(p, n).map(c => ({
 *   type: c.added ? "add" : c.removed ? "remove" : "keep",
 *   text: c.value,
 * })) });
 * ```
 */
export function defaultDiff(prev: string, next: string): DiffChunk[] {
  const a = tokenize(prev);
  const b = tokenize(next);
  const m = a.length;
  const n = b.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build chunks
  const raw: DiffChunk[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.unshift({ type: "keep", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: "add", text: b[j - 1] });
      j--;
    } else {
      raw.unshift({ type: "remove", text: a[i - 1] });
      i--;
    }
  }

  return mergeSameType(raw);
}
