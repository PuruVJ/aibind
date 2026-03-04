import { describe, it, expect } from "vitest";
import { defineModels } from "../../src/index.js";

describe("defineModels", () => {
  it("returns the same object reference", () => {
    const models = { fast: "model-a", slow: "model-b" };
    const result = defineModels(models);
    expect(result).toBe(models);
  });

  it("works with an empty object", () => {
    const result = defineModels({});
    expect(result).toEqual({});
  });
});
