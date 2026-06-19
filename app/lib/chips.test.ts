import { describe, it, expect } from "vitest";
import { nextIndex } from "./chips";

describe("nextIndex", () => {
  it("returns an in-range index that differs from the previous one", () => {
    for (let prev = 0; prev < 9; prev++) {
      for (let t = 0; t < 50; t++) {
        const n = nextIndex(prev, 9);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(9);
        expect(n).not.toBe(prev); // never repeats the immediately previous spot
      }
    }
  });

  it("covers every other index over many draws (not stuck on one spot)", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 300; t++) seen.add(nextIndex(0, 9));
    expect(seen.size).toBe(8); // all indices except prev (0)
  });

  it("returns 0 when there is only one option", () => {
    expect(nextIndex(0, 1)).toBe(0);
  });
});
