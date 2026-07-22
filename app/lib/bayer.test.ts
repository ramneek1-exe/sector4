import { describe, it, expect } from "vitest";
import {
  BAYER4,
  BAYER8,
  bayerThreshold,
  bayerThreshold8,
  bayerCells,
  bayerLuminancePasses,
  thresholdCells,
} from "./bayer";

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
  it("8x8 matrix is a permutation of 0..63", () => {
    expect([...BAYER8].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i));
  });
  it("bayerThreshold8 produces thresholds in (0,1)", () => {
    expect(bayerThreshold8(0, 0)).toBeGreaterThan(0);
    expect(bayerThreshold8(7, 7)).toBeLessThan(1);
  });
  it("white frame passes all luminance thresholds", () => {
    const passes = bayerLuminancePasses(px(4, 4, () => [255, 255, 255, 255]), 4, 4);
    expect(passes).toEqual(Array(16).fill(true));
  });
  it("black frame passes no luminance thresholds", () => {
    const passes = bayerLuminancePasses(px(4, 4, () => [0, 0, 0, 255]), 4, 4);
    expect(passes).toEqual(Array(16).fill(false));
  });
  it("mid-gray (128) dithers to exactly half the cells (4x4)", () => {
    const passes = bayerLuminancePasses(px(4, 4, () => [128, 128, 128, 255]), 4, 4);
    const count = passes.filter(Boolean).length;
    expect(count).toBe(8);
  });
  it("alpha 0 with white RGB passes no thresholds", () => {
    const passes = bayerLuminancePasses(px(4, 4, () => [255, 255, 255, 0]), 4, 4);
    expect(passes).toEqual(Array(16).fill(false));
  });
  it("gain stretches dark input: 32/255 gray at gain 4 dithers like mid-gray", () => {
    const dark = px(4, 4, () => [32, 32, 32, 255]);
    const noGain = bayerLuminancePasses(dark, 4, 4, "4x4", 1).filter(Boolean).length;
    const gained = bayerLuminancePasses(dark, 4, 4, "4x4", 4).filter(Boolean).length;
    expect(noGain).toBeLessThanOrEqual(2);
    expect(gained).toBe(8);
  });
  it("gain clamps at 1: white at gain 4 still passes everything, no overflow", () => {
    const passes = bayerLuminancePasses(px(4, 4, () => [255, 255, 255, 255]), 4, 4, "4x4", 4);
    expect(passes).toEqual(Array(16).fill(true));
  });
  it("bayerLuminancePasses works with 8x8 matrix", () => {
    const passes = bayerLuminancePasses(px(8, 8, () => [255, 255, 255, 255]), 8, 8, "8x8");
    expect(passes).toEqual(Array(64).fill(true));
  });

  describe("thresholdCells", () => {
    it("solid interior always passes; fully transparent never does", () => {
      const solid = thresholdCells(px(4, 4, () => [10, 20, 30, 255]), 4, 4);
      expect(solid).toHaveLength(16);
      expect(solid[0].color).toBe("rgb(10,20,30)");
      expect(thresholdCells(px(4, 4, () => [0, 0, 0, 0]), 4, 4)).toHaveLength(0);
    });
    it("no scatter: every cell in a checkerboard alpha pattern resolves the SAME way (round, not dithered)", () => {
      // Half the cells at alpha 0.6 (>= cutoff, all in), half at 0.4 (< cutoff, all out) --
      // unlike bayerCells, position never flips a cell's own coverage-based decision.
      const data = px(4, 4, (x) => [0, 0, 0, (x + 1) % 2 === 0 ? 153 : 102]); // 0.6 / 0.4
      const cells = thresholdCells(data, 4, 4);
      expect(cells).toHaveLength(8);
      expect(cells.every((c) => c.x % 2 === 1)).toBe(true);
    });
    it("respects a custom cutoff", () => {
      const data = px(2, 1, () => [0, 0, 0, 128]); // alpha ~0.502
      expect(thresholdCells(data, 2, 1, 0.4)).toHaveLength(2);
      expect(thresholdCells(data, 2, 1, 0.6)).toHaveLength(0);
    });
    it("t is a reading-order fraction, monotonic across the grid", () => {
      const cells = thresholdCells(px(4, 4, () => [0, 0, 0, 255]), 4, 4);
      const ts = cells.map((c) => c.t);
      expect(ts).toEqual([...ts].sort((a, b) => a - b));
      expect(new Set(ts).size).toBe(16);
    });
  });
});
