import { describe, it, expect } from "vitest";
import {
  standardDetector,
  claudeDetector,
  fenceDetector,
} from "../src/artifacts";

// ---------------------------------------------------------------------------
// standardDetector
// ---------------------------------------------------------------------------

describe("standardDetector", () => {
  describe("outside artifact", () => {
    it("returns null for prose lines", () => {
      expect(standardDetector("Hello world", false)).toBeNull();
      expect(standardDetector("", false)).toBeNull();
      expect(standardDetector("  some indented text", false)).toBeNull();
    });

    it("detects open tag with lang and title", () => {
      const result = standardDetector(
        '<artifact lang="tsx" title="Counter">',
        false,
      );
      expect(result).toEqual({
        type: "open",
        language: "tsx",
        title: "Counter",
      });
    });

    it("detects open tag with only lang", () => {
      const result = standardDetector('<artifact lang="py">', false);
      expect(result).toEqual({ type: "open", language: "py", title: "" });
    });

    it("detects open tag with only title", () => {
      const result = standardDetector('<artifact title="Readme">', false);
      expect(result).toEqual({ type: "open", language: "", title: "Readme" });
    });

    it("detects open tag with no attributes", () => {
      const result = standardDetector("<artifact>", false);
      expect(result).toEqual({ type: "open", language: "", title: "" });
    });

    it("returns null for a close tag when not in artifact", () => {
      // Close tag outside artifact is ignored (treated as prose)
      expect(standardDetector("</artifact>", false)).toBeNull();
    });

    it("returns null for unrelated tags", () => {
      expect(standardDetector("<div>", false)).toBeNull();
      expect(standardDetector("<artifactXYZ>", false)).toBeNull();
    });

    it("is case-sensitive — does not match <ARTIFACT>", () => {
      expect(standardDetector('<ARTIFACT lang="ts">', false)).toBeNull();
    });
  });

  describe("inside artifact", () => {
    it("returns content for regular code lines", () => {
      expect(standardDetector("const x = 1;", true)).toEqual({
        type: "content",
        text: "const x = 1;",
      });
    });

    it("returns content for empty line", () => {
      expect(standardDetector("", true)).toEqual({ type: "content", text: "" });
    });

    it("returns content for lines that look like prose tags", () => {
      expect(standardDetector("<div>hello</div>", true)).toEqual({
        type: "content",
        text: "<div>hello</div>",
      });
    });

    it("returns close on </artifact>", () => {
      expect(standardDetector("</artifact>", true)).toEqual({ type: "close" });
    });

    it("returns close even if there is surrounding whitespace in the line", () => {
      // The regex just tests the line; whitespace-padded close is still a close
      // Our regex does not require strict whole-line match, just presence
      expect(standardDetector("  </artifact>  ", true)).toEqual({
        type: "close",
      });
    });

    it("does NOT return open for nested <artifact> tag — treated as content", () => {
      // When inArtifact=true the detector only checks for close; open tag
      // inside becomes content (no nesting support by design)
      const result = standardDetector('<artifact lang="ts">', true);
      expect(result).toEqual({ type: "content", text: '<artifact lang="ts">' });
    });
  });
});

// ---------------------------------------------------------------------------
// claudeDetector
// ---------------------------------------------------------------------------

describe("claudeDetector", () => {
  describe("outside artifact", () => {
    it("returns null for prose", () => {
      expect(claudeDetector("Hello", false)).toBeNull();
    });

    it("detects full antArtifact open tag", () => {
      const result = claudeDetector(
        '<antArtifact identifier="counter" type="application/code" language="tsx" title="Counter">',
        false,
      );
      expect(result).toEqual({
        type: "open",
        language: "tsx",
        title: "Counter",
        id: "counter",
      });
    });

    it("uses identifier as id when present", () => {
      const result = claudeDetector(
        '<antArtifact identifier="my-comp" language="svelte" title="MyComp">',
        false,
      );
      expect(result?.type === "open" && result.id).toBe("my-comp");
    });

    it("id is undefined when identifier attribute is absent", () => {
      const result = claudeDetector(
        '<antArtifact language="python" title="Script">',
        false,
      );
      expect(result?.type === "open" && result.id).toBeUndefined();
    });

    it("extracts language correctly", () => {
      const result = claudeDetector(
        '<antArtifact identifier="x" language="rust" title="Lib">',
        false,
      );
      expect(result?.type === "open" && result.language).toBe("rust");
    });

    it("returns null for <artifact> (standard tag)", () => {
      expect(claudeDetector('<artifact lang="ts">', false)).toBeNull();
    });

    it("returns null for </antArtifact> when not in artifact", () => {
      expect(claudeDetector("</antArtifact>", false)).toBeNull();
    });
  });

  describe("inside artifact", () => {
    it("returns content for code lines", () => {
      expect(claudeDetector("export default function() {}", true)).toEqual({
        type: "content",
        text: "export default function() {}",
      });
    });

    it("returns close on </antArtifact>", () => {
      expect(claudeDetector("</antArtifact>", true)).toEqual({ type: "close" });
    });

    it("does not close on </artifact> — different tag", () => {
      const result = claudeDetector("</artifact>", true);
      expect(result).toEqual({ type: "content", text: "</artifact>" });
    });
  });
});

// ---------------------------------------------------------------------------
// fenceDetector
// ---------------------------------------------------------------------------

describe("fenceDetector", () => {
  describe("outside artifact", () => {
    it("returns null for prose", () => {
      expect(fenceDetector("Hello world", false)).toBeNull();
    });

    it("detects backtick fence with language", () => {
      const result = fenceDetector("```tsx", false);
      expect(result).toEqual({ type: "open", language: "tsx", title: "" });
    });

    it("detects backtick fence without language", () => {
      const result = fenceDetector("```", false);
      expect(result).toEqual({ type: "open", language: "", title: "" });
    });

    it("detects tilde fence", () => {
      const result = fenceDetector("~~~python", false);
      expect(result).toEqual({ type: "open", language: "python", title: "" });
    });

    it("accepts 1-3 leading spaces", () => {
      expect(fenceDetector("   ```ts", false)).toEqual({
        type: "open",
        language: "ts",
        title: "",
      });
    });

    it("does NOT match with 4 leading spaces (code block indent, not fence)", () => {
      expect(fenceDetector("    ```ts", false)).toBeNull();
    });

    it("detects longer fence (4+ backticks)", () => {
      const result = fenceDetector("````rust", false);
      expect(result).toEqual({ type: "open", language: "rust", title: "" });
    });
  });

  describe("inside artifact", () => {
    it("returns content for regular lines", () => {
      expect(fenceDetector("const x = 1;", true)).toEqual({
        type: "content",
        text: "const x = 1;",
      });
    });

    it("closes on any fence sequence", () => {
      expect(fenceDetector("```", true)).toEqual({ type: "close" });
    });

    it("closes on tilde fence", () => {
      expect(fenceDetector("~~~", true)).toEqual({ type: "close" });
    });

    it("closes on fence with language tag (shouldn't happen but handles it)", () => {
      // A line like ```ts inside the block acts as close
      expect(fenceDetector("```ts", true)).toEqual({ type: "close" });
    });

    it("treats two backticks as content (not a fence)", () => {
      // `` is only 2 backticks, not a fence
      const result = fenceDetector("``", true);
      expect(result).toEqual({ type: "content", text: "``" });
    });
  });
});
