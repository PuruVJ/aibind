import { describe, it, expect } from "vitest";
import { defineModels } from "../../src/lib/index.svelte.js";

describe("defineModels", () => {
  it("returns the same object reference", () => {
    const input = { fast: "model-a", smart: "model-b" };
    const result = defineModels(input);
    expect(result).toBe(input);
  });

  it("works with empty object", () => {
    const result = defineModels({});
    expect(result).toEqual({});
  });
});
