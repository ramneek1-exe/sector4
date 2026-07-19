import { describe, it, expect } from "vitest";
import { BAYER4, bayerThreshold, bayerCells } from "./bayer";

function px(cols: number, rows: number, fill: (x: number, y: number) => number[]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(cols * rows * 4);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * cols + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
  return d;
}

describe("bayer", () => {
  it("matrix is a 4x4 permutation of 0..15 and thresholds are in (0,1)", () => {
    expect([...BAYER4].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(bayerThreshold(0, 0)).toBeGreaterThan(0);
    expect(bayerThreshold(3, 3)).toBeLessThan(1);
  });
  it("solid interior always passes; fully transparent never does", () => {
    const solid = bayerCells(px(4, 4, () => [10, 20, 30, 255]), 4, 4);
    expect(solid).toHaveLength(16);
    expect(solid[0].color).toBe("rgb(10,20,30)");
    expect(bayerCells(px(4, 4, () => [0, 0, 0, 0]), 4, 4)).toHaveLength(0);
  });
  it("half-alpha edge dithers to roughly half the cells by the ordered matrix", () => {
    const n = bayerCells(px(4, 4, () => [0, 0, 0, 128]), 4, 4).length;
    expect(n).toBe(8); // alpha 128/255 ≈ 0.502 passes exactly thresholds (k+0.5)/16 for k<8
  });
});
