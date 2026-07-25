// Pure math for the landing start-lights preloader (see
// docs/superpowers/specs/2026-07-24-landing-preloader-start-lights-design.md).
// No React, no DOM — single source for the sequence constants + the pixel-disc
// cell generator, so the component and its tests never drift.
import { thresholdCells, type BayerCell } from "@/app/lib/bayer";

export const LIGHT_COUNT = 5;
export const ARM_INTERVAL_MS = 240;
export const ARM_DONE_MS = LIGHT_COUNT * ARM_INTERVAL_MS; // 1200
export const HOLD_MIN_MS = 200;
export const HOLD_MAX_MS = 800;
export const HARD_CAP_MS = 2500;
export const OUT_MS = 300;

/** Illuminate timestamp (ms from t0) for each dot, left to right. */
export function armSchedule(): number[] {
  return Array.from({ length: LIGHT_COUNT }, (_, i) => i * ARM_INTERVAL_MS);
}

/** Random suspense hold in [HOLD_MIN_MS, HOLD_MAX_MS]. `rand` injected for tests. */
export function pickHold(rand: () => number = Math.random): number {
  return HOLD_MIN_MS + rand() * (HOLD_MAX_MS - HOLD_MIN_MS);
}

/**
 * Lights-out time (ms from t0): the later of the random suspense hold finishing
 * and the hero assets being ready, hard-capped so it never drags. A null
 * heroReadyAt (hero never signaled) collapses to the cap via max-with-Infinity.
 */
export function resolveLightsOut({
  hold,
  heroReadyAt,
}: {
  hold: number;
  heroReadyAt: number | null;
}): number {
  const ready = heroReadyAt ?? Infinity;
  const target = Math.max(ARM_DONE_MS + hold, ready);
  return Math.min(target, HARD_CAP_MS);
}

/**
 * Hard-threshold pixel-disc cells for one dot: a cols×cols RGBA coverage field
 * for a centered filled circle (distance-based AA edge), run through the shared
 * thresholdCells (app/lib/bayer.ts). Pure — builds the byte field directly, no
 * canvas — so it is node-testable; the component paints the result via
 * useRevealCanvas. Hard threshold (not ordered-Bayer edge dither), matching the
 * emblem pixel-art finding.
 */
export function discCells(
  cols: number,
  color: { r: number; g: number; b: number },
  cutoff = 0.5,
): BayerCell[] {
  const rows = cols;
  const data = new Uint8ClampedArray(cols * rows * 4);
  const center = (cols - 1) / 2;
  const radius = cols / 2;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const dist = Math.hypot(x - center, y - center);
      // coverage 1 well inside, ramps to 0 across the last half-cell at the edge.
      const coverage = Math.max(0, Math.min(1, radius - dist + 0.5));
      const i = (y * cols + x) * 4;
      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = Math.round(coverage * 255);
    }
  }
  return thresholdCells(data, cols, rows, cutoff);
}
