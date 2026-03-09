/**
 * @aibind/core/artifact subpath entry.
 *
 * Import built-in detectors and types from here:
 *
 * ```ts
 * import * as detectors from "@aibind/core/artifact";
 *
 * const stream = new Stream({ artifact: { detector: detectors.claude } });
 * // or: detectors.default (standard <artifact> tags)
 * // or: detectors.fence  (fenced code blocks)
 * ```
 */

export {
  standardDetector as default,
  claudeDetector as claude,
  fenceDetector as fence,
} from "./artifacts";

export type {
  Artifact,
  ArtifactDetector,
  ArtifactLineResult,
} from "./artifacts";
