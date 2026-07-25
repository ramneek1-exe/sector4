// Pure math for the landing start-lights preloader (see
// docs/superpowers/specs/2026-07-24-landing-preloader-start-lights-design.md).
// No React, no DOM — single source for the sequence timing, so the component and
// its tests never drift.

export const LIGHT_COUNT = 5;
// Real-F1 cadence: lights come on ~1 per second, so the arm alone runs ~4s and the
// whole sequence lands ~4-5s (arm + a short random suspense hold).
export const ARM_INTERVAL_MS = 800;
export const ARM_DONE_MS = LIGHT_COUNT * ARM_INTERVAL_MS; // 4000
export const HOLD_MIN_MS = 200;
export const HOLD_MAX_MS = 800;
// Backstop ceiling from t0. Comfortably above the worst-case arm+hold (4800) so a
// slow hero can still gate lights-out, but the sequence never drags past it.
export const HARD_CAP_MS = 5500;
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
