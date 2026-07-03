// Pure SVG polyline generator for the calibration trend chart (M7). Maps a series of
// 0..1-normalized values to an SVG `points` string across a padded plot box, inverting y
// (1 = top). Kept in lib (Blob-free, no JSX) so it is unit-testable.
export interface ChartPad {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function buildLinePath(
  norm: number[],
  w = 640,
  h = 220,
  pad: ChartPad = { top: 16, right: 16, bottom: 30, left: 16 },
): string {
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const n = norm.length;
  return norm
    .map((v, i) => {
      const x = pad.left + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
      const clamped = Math.max(0, Math.min(1, v));
      const y = pad.top + innerH * (1 - clamped);
      return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
    })
    .join(" ");
}
