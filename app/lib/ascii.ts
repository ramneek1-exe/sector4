// Pure pixel → ASCII sampling. No DOM: callers hand in raw RGBA pixels (from a
// canvas in the browser, or a synthetic array in tests) and get back a grid of
// colored characters. The colour is the per-cell average of the source pixels —
// so an ASCII-fied driver helmet KEEPS its team colour (PRD §8 ASCII/dither look).
//
// The `shaders` package can only ASCII-ify another shader's output, never real
// DOM/SVG (see handoff M2/M3 findings) — so colour-retaining glyph ASCII is done
// here by sampling, not by the shader.

// Density ramp, lightest → darkest coverage. Index by cell coverage.
export const RAMP = " .:-=+*#%@";

export type AsciiCell = {
  /** Character for this cell; "" for an empty (below-threshold) cell. */
  ch: string;
  /** Average colour as #rrggbb, or null when the cell is empty. */
  color: string | null;
};

export type AsciiGrid = {
  cols: number;
  rows: number;
  /** Row-major, length cols*rows. */
  cells: AsciiCell[];
};

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/**
 * Choose a row count that keeps the source aspect ratio once rendered in a
 * monospace grid, where each glyph cell is ~`charAspect` as wide as it is tall.
 */
export function asciiRowsFor(
  width: number,
  height: number,
  cols: number,
  charAspect = 0.55,
): number {
  return Math.max(1, Math.round((cols * charAspect * height) / width));
}

/**
 * Sample an RGBA buffer into an ASCII grid. `data` is `width*height*4` bytes,
 * row-major, as returned by `CanvasRenderingContext2D.getImageData().data`.
 *
 * Colour is alpha-weighted so antialiased edges don't wash the team colour out
 * toward the (transparent) background. Cells whose mean coverage is below
 * `threshold` are left empty so the glyph reads as a shape, not a filled box.
 */
export function sampleAscii(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  cols: number,
  opts: { rows?: number; threshold?: number } = {},
): AsciiGrid {
  const rows = opts.rows ?? asciiRowsFor(width, height, cols);
  const threshold = opts.threshold ?? 0.18;
  const cellW = width / cols;
  const cellH = height / rows;
  const cells: AsciiCell[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * cellW);
      const x1 = Math.min(width, Math.ceil((c + 1) * cellW));
      const y0 = Math.floor(r * cellH);
      const y1 = Math.min(height, Math.ceil((r + 1) * cellH));

      let aSum = 0; // mean alpha → coverage
      let wSum = 0; // alpha weight for colour
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const a = data[i + 3] / 255;
          aSum += a;
          rSum += data[i] * a;
          gSum += data[i + 1] * a;
          bSum += data[i + 2] * a;
          wSum += a;
          count++;
        }
      }

      const coverage = count > 0 ? aSum / count : 0;
      if (coverage < threshold || wSum === 0) {
        cells.push({ ch: "", color: null });
        continue;
      }
      const idx = Math.min(RAMP.length - 1, Math.round(coverage * (RAMP.length - 1)));
      const color = `#${toHex(rSum / wSum)}${toHex(gSum / wSum)}${toHex(bSum / wSum)}`;
      cells.push({ ch: RAMP[idx] || RAMP[RAMP.length - 1], color });
    }
  }

  return { cols, rows, cells };
}
