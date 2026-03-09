/**
 * @aibind/svelte/artifact — re-exports built-in detectors and types from @aibind/core/artifact.
 *
 * ```ts
 * import * as detectors from "@aibind/svelte/artifact";
 *
 * const stream = new Stream({ artifact: { detector: detectors.claude } });
 * ```
 */

export { default, claude, fence } from "@aibind/core/artifact";

export type {
  Artifact,
  ArtifactDetector,
  ArtifactLineResult,
} from "@aibind/core/artifact";
