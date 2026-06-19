import { describe, it, expect } from "vitest";
import { scatterDelay } from "./scatter";

describe("scatterDelay", () => {
  it("is deterministic for the same input", () => {
    expect(scatterDelay(42, 500)).toBe(scatterDelay(42, 500));
  });

  it("stays within [0, span)", () => {
    for (let i = 0; i < 500; i++) {
      const d = scatterDelay(i, 500);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(500);
    }
  });

  it("produces many distinct buckets (not the old 23-clump artifact)", () => {
    const vals = new Set<number>();
    for (let i = 0; i < 200; i++) vals.add(Math.round(scatterDelay(i, 500)));
    expect(vals.size).toBeGreaterThan(120); // was capped at 23 with the old modulo
  });
});
