/**
 * Model routing utilities.
 *
 * These are pure functions that return a `routeModel` function
 * suitable for passing to Stream/useStream options.
 */

/**
 * Route to the first model whose `maxLength` is >= the prompt's character count.
 * Rules are matched in ascending `maxLength` order. If no rule matches, `fallback` is used.
 *
 * @example
 * ```ts
 * import { routeByLength } from "@aibind/core";
 *
 * const stream = new Stream<ModelKey>({
 *   routeModel: routeByLength([
 *     { maxLength: 200, model: "fast" },
 *     { maxLength: 800, model: "smart" },
 *   ], "reason"),
 * });
 * ```
 */
export function routeByLength<M extends string>(
  rules: Array<{ maxLength: number; model: M }>,
  fallback: M,
): (prompt: string) => M {
  const sorted = [...rules].sort((a, b) => a.maxLength - b.maxLength);
  return (prompt: string): M =>
    sorted.find((r) => prompt.length <= r.maxLength)?.model ?? fallback;
}
