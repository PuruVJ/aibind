import { describe, it, expect } from "vitest";
import { routeByLength } from "../src/routing";

describe("routeByLength", () => {
  const rules = [
    { maxLength: 200, model: "fast" },
    { maxLength: 800, model: "smart" },
  ] as const;
  const fallback = "reason" as const;
  const route = routeByLength([...rules], fallback);

  it("returns the first matching model for a short prompt", () => {
    expect(route("hi")).toBe("fast");
    expect(route("a".repeat(200))).toBe("fast"); // exact boundary
  });

  it("returns the next matching model for a medium prompt", () => {
    expect(route("a".repeat(201))).toBe("smart");
    expect(route("a".repeat(800))).toBe("smart"); // exact boundary
  });

  it("returns fallback when no rule matches", () => {
    expect(route("a".repeat(801))).toBe("reason");
    expect(route("a".repeat(10_000))).toBe("reason");
  });

  it("handles an empty prompt (length 0)", () => {
    expect(route("")).toBe("fast");
  });

  it("sorts rules by maxLength regardless of input order", () => {
    // Rules provided in reverse order — should still work correctly
    const reversed = routeByLength(
      [
        { maxLength: 800, model: "smart" },
        { maxLength: 200, model: "fast" },
      ],
      "reason",
    );
    expect(reversed("hi")).toBe("fast");
    expect(reversed("a".repeat(500))).toBe("smart");
    expect(reversed("a".repeat(900))).toBe("reason");
  });

  it("does not mutate the original rules array", () => {
    const originalRules = [
      { maxLength: 800, model: "smart" },
      { maxLength: 200, model: "fast" },
    ];
    const copy = [...originalRules];
    routeByLength(originalRules, "reason");
    expect(originalRules).toEqual(copy);
  });

  it("works with a single rule", () => {
    const singleRule = routeByLength(
      [{ maxLength: 100, model: "fast" }],
      "smart",
    );
    expect(singleRule("short")).toBe("fast");
    expect(singleRule("a".repeat(101))).toBe("smart");
  });

  it("works with zero rules — always returns fallback", () => {
    const noRules = routeByLength([], "reason");
    expect(noRules("anything")).toBe("reason");
    expect(noRules("")).toBe("reason");
  });
});
