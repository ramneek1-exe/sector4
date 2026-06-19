import { describe, it, expect } from "vitest";
import { visibleChips } from "./chips";

describe("visibleChips", () => {
  it("returns slotCount distinct example indices in range", () => {
    const total = 7;
    for (let cycle = 0; cycle < 20; cycle++) {
      const v = visibleChips(cycle, 3, total);
      expect(v.length).toBe(3);
      expect(new Set(v).size).toBe(3); // no slot shows the same example as another
      v.forEach((idx) => {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(total);
      });
    }
  });

  it("advances across cycles (rotation, not static)", () => {
    expect(visibleChips(0, 3, 7)).not.toEqual(visibleChips(1, 3, 7));
  });
});
