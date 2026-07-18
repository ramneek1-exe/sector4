// Pure SVG polyline generator for the calibration trend chart (M7). Maps a series of
// 0..1-normalized values to an SVG `points` string across a padded plot box, inverting y
// (1 = top). Kept in lib (Blob-free, no JSX) so it is unit-testable.
export interface ChartPad {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Pt {
  x: number;
  y: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function pointCoords(
  norm: number[],
  w = 640,
  h = 220,
  pad: ChartPad = { top: 16, right: 16, bottom: 30, left: 16 },
): Pt[] {
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const n = norm.length;
  return norm.map((v, i) => {
    const x = pad.left + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const clamped = Math.max(0, Math.min(1, v));
    const y = pad.top + innerH * (1 - clamped);
    return { x: round2(x), y: round2(y) };
  });
}

export function yLevel(
  value: number,
  h = 220,
  pad: ChartPad = { top: 16, right: 16, bottom: 30, left: 16 },
): number {
  const innerH = h - pad.top - pad.bottom;
  return round2(pad.top + innerH * (1 - Math.max(0, Math.min(1, value))));
}

export function buildLinePath(
  norm: number[],
  w = 640,
  h = 220,
  pad: ChartPad = { top: 16, right: 16, bottom: 30, left: 16 },
): string {
  return pointCoords(norm, w, h, pad).map((p) => `${p.x},${p.y}`).join(" ");
}
