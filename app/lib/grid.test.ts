import { describe, it, expect } from "vitest";
import { getGrid, gridKey } from "./grid";

describe("getGrid", () => {
  it("returns the Austria 2026 grid with the polesitter at 1", () => {
    const grid = getGrid(2026, "Austria");
    expect(grid).toBeDefined();
    expect(grid?.RUS).toBe(1);
    expect(grid?.LEC).toBe(2);
    expect(Object.keys(grid ?? {}).length).toBe(22);
  });

  it("returns undefined for a weekend with no grid yet", () => {
    expect(getGrid(2026, "Great Britain")).toBeUndefined();
  });

  it("keys by year and gp", () => {
    expect(gridKey(2026, "Austria")).toBe("2026-Austria");
  });
});
