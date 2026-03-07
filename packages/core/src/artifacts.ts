/**
 * Artifact types and built-in detectors for streaming artifact extraction.
 *
 * An artifact is a standalone code block or file emitted by the model within
 * its response. The detector function is pluggable — users supply whichever
 * convention their system prompt establishes.
 */

// --- Types ---

export interface Artifact {
  /** Stable identifier. Assigned when the open marker is seen. */
  id: string;
  /** Language / file type, e.g. "tsx", "python". Empty string if not applicable. */
  language: string;
  /** Human-readable display name. Empty string if not applicable. */
  title: string;
  /** Content accumulated during streaming. */
  content: string;
  /** True after the close marker is seen (or stream ends while artifact is open). */
  complete: boolean;
}

export type ArtifactLineResult =
  | { type: "open"; language: string; title: string; id?: string }
  | { type: "content"; text: string }
  | { type: "close" }
  | null;

/**
 * A function that classifies each line of the stream.
 * Called once per complete line, in order.
 *
 * @param line - The line text (without trailing newline).
 * @param inArtifact - Whether we are currently inside an open artifact.
 * @returns A result describing how to handle the line, or null for prose.
 */
export type ArtifactDetector = (
  line: string,
  inArtifact: boolean,
) => ArtifactLineResult;

// --- Regex constants (never inline) ---

// Standard <artifact lang="..." title="..."> convention
const RE_ARTIFACT_OPEN = /<artifact\b([^>]*)>/;
const RE_ARTIFACT_LANG = /\blang="([^"]*)"/;
const RE_ARTIFACT_TITLE = /\btitle="([^"]*)"/;
const RE_ARTIFACT_CLOSE = /<\/artifact>/;

// Anthropic <antArtifact identifier="..." language="..." title="..."> convention
const RE_ANT_OPEN = /<antArtifact\b([^>]*)>/;
const RE_ANT_LANG = /\blanguage="([^"]*)"/;
const RE_ANT_TITLE = /\btitle="([^"]*)"/;
const RE_ANT_ID = /\bidentifier="([^"]*)"/;
const RE_ANT_CLOSE = /<\/antArtifact>/;

// Fenced code blocks (``` or ~~~, with optional language tag)
const RE_FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(\S*)/;

// --- Built-in detectors ---

/**
 * Standard `<artifact>` tag detector.
 *
 * ```
 * <artifact lang="tsx" title="Counter">
 *   ... code ...
 * </artifact>
 * ```
 */
export function standardDetector(
  line: string,
  inArtifact: boolean,
): ArtifactLineResult {
  if (!inArtifact) {
    const m = RE_ARTIFACT_OPEN.exec(line);
    if (m) {
      const attrs = m[1];
      return {
        type: "open",
        language: RE_ARTIFACT_LANG.exec(attrs)?.[1] ?? "",
        title: RE_ARTIFACT_TITLE.exec(attrs)?.[1] ?? "",
      };
    }
    return null;
  }
  if (RE_ARTIFACT_CLOSE.test(line)) return { type: "close" };
  return { type: "content", text: line };
}

/**
 * Anthropic / Claude native artifact detector.
 *
 * ```xml
 * <antArtifact identifier="counter" type="application/code" language="tsx" title="Counter">
 *   ... code ...
 * </antArtifact>
 * ```
 *
 * The `identifier` attribute is used as the artifact ID instead of a generated UUID.
 */
export function claudeDetector(
  line: string,
  inArtifact: boolean,
): ArtifactLineResult {
  if (!inArtifact) {
    const m = RE_ANT_OPEN.exec(line);
    if (m) {
      const attrs = m[1];
      return {
        type: "open",
        language: RE_ANT_LANG.exec(attrs)?.[1] ?? "",
        title: RE_ANT_TITLE.exec(attrs)?.[1] ?? "",
        id: RE_ANT_ID.exec(attrs)?.[1],
      };
    }
    return null;
  }
  if (RE_ANT_CLOSE.test(line)) return { type: "close" };
  return { type: "content", text: line };
}

/**
 * Fenced code block detector (``` or ~~~).
 *
 * Note: code fences appear inline in prose too. Use this detector only
 * when your system prompt instructs the model to emit standalone fenced blocks.
 *
 * ```tsx
 * ... code ...
 * ```
 */
export function fenceDetector(
  line: string,
  inArtifact: boolean,
): ArtifactLineResult {
  if (!inArtifact) {
    const m = RE_FENCE_OPEN.exec(line);
    if (m) {
      return { type: "open", language: m[2] ?? "", title: "" };
    }
    return null;
  }
  // Close on any fence sequence (regardless of length / style)
  if (RE_FENCE_OPEN.test(line)) return { type: "close" };
  return { type: "content", text: line };
}

// Default export — used as `detectors.default` when imported as a namespace
export default standardDetector;
