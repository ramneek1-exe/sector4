/**
 * Shared alpha-Bayer renderer for glyphs and emblems.
 *
 * Solid interiors always pass the threshold, antialiased edges dither using the
 * ordered Bayer matrix. The `t` value on each cell can be used by callers to order
 * the dither-resolve reveal (paint cells with t <= progress).
 */

export const BAYER4: number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export const BAYER8: number[] = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

export function bayerThreshold(x: number, y: number): number {
  return (BAYER4[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
}

export function bayerThreshold8(x: number, y: number): number {
  return (BAYER8[(y % 8) * 8 + (x % 8)] + 0.5) / 64;
}

export type BayerCell = { x: number; y: number; color: string; t: number };

export function bayerLuminancePasses(
  data: Uint8ClampedArray,
  cols: number,
  rows: number,
  matrix: "4x4" | "8x8" = "4x4"
): boolean[] {
  const result: boolean[] = [];
  const getThreshold = matrix === "8x8" ? bayerThreshold8 : bayerThreshold;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Relative luminance (sRGB weighted)
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      // Premultiply by alpha
      const alpha = a / 255;
      const luminance = lum * alpha;

      const threshold = getThreshold(x, y);
      result.push(luminance >= threshold);
    }
  }

  return result;
}

export function bayerCells(
  data: Uint8ClampedArray,
  cols: number,
  rows: number
): BayerCell[] {
  const cells: BayerCell[] = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      const alpha = a / 255;
      const t = bayerThreshold(x, y);

      if (alpha >= t) {
        cells.push({
          x,
          y,
          color: `rgb(${r},${g},${b})`,
          t,
        });
      }
    }
  }

  return cells;
}
