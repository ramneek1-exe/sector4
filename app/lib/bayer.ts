/**
 * Shared alpha-Bayer renderer for glyphs and emblems.
 *
 * Solid interiors always pass the threshold, antialiased edges dither using the
 * ordered Bayer matrix. The `t` value on each cell can be used by callers to order
 * the dither-resolve reveal (paint cells with t <= progress).
 */

export const BAYER4: number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function bayerThreshold(x: number, y: number): number {
  return (BAYER4[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
}

export type BayerCell = { x: number; y: number; color: string; t: number };

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
