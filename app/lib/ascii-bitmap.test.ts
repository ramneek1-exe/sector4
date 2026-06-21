import { describe, expect, it } from "vitest";
import { GLYPH_DIM, glyphFor } from "@/app/lib/ascii-bitmap";

describe("glyphFor", () => {
  it("returns null below the first threshold", () => {
    expect(glyphFor(0)).toBeNull();
    expect(glyphFor(0.1)).toBeNull(); // strictly greater
  });

  it("returns denser glyphs as brightness rises", () => {
    const lit = (b: number) => glyphFor(b)!.reduce((a, c) => a + c, 0);
    expect(lit(0.2)).toBe(1); // single dot
    expect(lit(0.35)).toBe(2); // two dots
    expect(lit(0.85)).toBeGreaterThan(lit(0.35)); // big dot is densest
  });

  it("every glyph is a full 5x5 bitmap", () => {
    for (const b of [0.2, 0.35, 0.45, 0.55, 0.65, 0.85]) {
      expect(glyphFor(b)).toHaveLength(GLYPH_DIM * GLYPH_DIM);
    }
  });
});
