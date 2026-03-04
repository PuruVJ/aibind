import { describe, it, expect } from "vitest";
import { MarkdownRecovery } from "../src/index.js";

describe("MarkdownRecovery.recover", () => {
  // --- Code blocks ---
  describe("code blocks", () => {
    it("closes unclosed code block with ```", () => {
      expect(MarkdownRecovery.recover("```js\nconst x = 1;")).toBe(
        "```js\nconst x = 1;\n```",
      );
    });

    it("closes unclosed code block with ~~~", () => {
      expect(MarkdownRecovery.recover("~~~\ncode")).toBe("~~~\ncode\n~~~");
    });

    it("does not modify closed code blocks", () => {
      const md = "```\ncode\n```";
      expect(MarkdownRecovery.recover(md)).toBe(md);
    });

    it("handles multiple code blocks where last is unclosed", () => {
      const md = "```\nfirst\n```\n\n```\nsecond";
      expect(MarkdownRecovery.recover(md)).toBe(
        "```\nfirst\n```\n\n```\nsecond\n```",
      );
    });
  });

  // --- Bold (**) ---
  describe("bold (**)", () => {
    it("closes unclosed **", () => {
      expect(MarkdownRecovery.recover("**bold text")).toBe("**bold text**");
    });

    it("does not modify closed bold", () => {
      expect(MarkdownRecovery.recover("**bold**")).toBe("**bold**");
    });

    it("closes the unclosed one when one of two is open", () => {
      expect(MarkdownRecovery.recover("**first** and **second")).toBe(
        "**first** and **second**",
      );
    });
  });

  // --- Italic (*) ---
  describe("italic (*)", () => {
    it("closes unclosed *", () => {
      expect(MarkdownRecovery.recover("*italic text")).toBe("*italic text*");
    });

    it("does not modify closed italic", () => {
      expect(MarkdownRecovery.recover("*italic*")).toBe("*italic*");
    });
  });

  // --- Bold (__) ---
  describe("bold (__)", () => {
    it("closes unclosed __", () => {
      expect(MarkdownRecovery.recover("__bold text")).toBe("__bold text__");
    });

    it("does not modify closed __", () => {
      expect(MarkdownRecovery.recover("__bold__")).toBe("__bold__");
    });
  });

  // --- Italic (_) ---
  describe("italic (_)", () => {
    it("closes unclosed _", () => {
      expect(MarkdownRecovery.recover("_italic text")).toBe("_italic text_");
    });

    it("does not modify closed _", () => {
      expect(MarkdownRecovery.recover("_italic_")).toBe("_italic_");
    });
  });

  // --- Strikethrough (~~) ---
  describe("strikethrough (~~)", () => {
    it("closes unclosed ~~", () => {
      expect(MarkdownRecovery.recover("~~struck text")).toBe("~~struck text~~");
    });

    it("does not modify closed ~~", () => {
      expect(MarkdownRecovery.recover("~~struck~~")).toBe("~~struck~~");
    });
  });

  // --- Inline code (`) ---
  describe("inline code (`)", () => {
    it("closes unclosed backtick", () => {
      expect(MarkdownRecovery.recover("`code")).toBe("`code`");
    });

    it("does not modify closed inline code", () => {
      expect(MarkdownRecovery.recover("`code`")).toBe("`code`");
    });

    it("does not count backticks inside code blocks", () => {
      const md = "```\ncode with ` backtick\n```";
      expect(MarkdownRecovery.recover(md)).toBe(md);
    });
  });

  // --- Code content exclusion ---
  describe("ignores markers inside code", () => {
    it("** inside inline code is not treated as unclosed bold", () => {
      const md = "`x ** y`";
      expect(MarkdownRecovery.recover(md)).toBe(md);
    });

    it("* inside inline code is not treated as unclosed italic", () => {
      const md = "`a * b`";
      expect(MarkdownRecovery.recover(md)).toBe(md);
    });

    it("** inside code block is not treated as unclosed bold", () => {
      const md = "```\n2 ** 3\n```";
      expect(MarkdownRecovery.recover(md)).toBe(md);
    });
  });

  // --- Multiple unclosed ---
  describe("multiple unclosed markers", () => {
    it("closes both ** and *", () => {
      const result = MarkdownRecovery.recover("**bold and *italic");
      expect(result).toContain("**");
      expect(result).toContain("*");
      // Should close both
      expect(result).toBe("**bold and *italic***");
    });

    it("closes ** and ~~", () => {
      const result = MarkdownRecovery.recover("**bold ~~strike");
      expect(result).toContain("**");
      expect(result).toContain("~~");
    });
  });

  // --- Edge cases ---
  describe("edge cases", () => {
    it("empty string", () => {
      expect(MarkdownRecovery.recover("")).toBe("");
    });

    it("plain text without markers", () => {
      expect(MarkdownRecovery.recover("Hello world")).toBe("Hello world");
    });

    it("already balanced complex markdown", () => {
      const md = "**bold** and *italic* and `code` and ~~strike~~";
      expect(MarkdownRecovery.recover(md)).toBe(md);
    });
  });
});

describe("MarkdownRecovery.hasUnterminated", () => {
  it("returns false for balanced markdown", () => {
    expect(MarkdownRecovery.hasUnterminated("**bold** and *italic*")).toBe(
      false,
    );
  });

  it("returns true for unclosed bold", () => {
    expect(MarkdownRecovery.hasUnterminated("**bold text")).toBe(true);
  });

  it("returns true for unclosed code block", () => {
    expect(MarkdownRecovery.hasUnterminated("```js\ncode")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(MarkdownRecovery.hasUnterminated("")).toBe(false);
  });

  it("returns false for plain text", () => {
    expect(MarkdownRecovery.hasUnterminated("Hello world")).toBe(false);
  });
});
