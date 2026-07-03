import { describe, it, expect } from "vitest";
import { COMPOUND_COLOR, COMPOUND_LETTER } from "./compound";

describe("compound maps", () => {
  it("has a hex color and a single letter for each dry compound", () => {
    for (const c of ["SOFT", "MEDIUM", "HARD"] as const) {
      expect(COMPOUND_COLOR[c]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(COMPOUND_LETTER[c]).toBe(c[0]);
    }
  });
});
