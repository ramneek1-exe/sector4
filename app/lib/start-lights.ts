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

// --- Lights-out → hero curtain ------------------------------------------------
// See docs/superpowers/specs/2026-07-25-hero-curtain-reveal-design.md.
// Replaces the old flat opacity dissolve (OUT_MS): the warm field lifts straight up
// out of frame while the gantry lifts further on top of it (parallax).

/** A beat on the dark gantry after the lamps go out, before the lift starts — the "GO". */
export const LIGHTS_OUT_HOLD_MS = 120;
/** How long the curtain itself takes to clear the viewport. */
export const CURTAIN_MS = 700;
/** How far through the curtain the hero's paused .fog-in is released. */
export const TEXT_RELEASE_FRAC = 0.65;
/**
 * The inline gate in app/page.tsx force-reveals the hero this long after parse, so a
 * bundle that never hydrates can't strand it invisible behind a paused .fog-in. Exported
 * from here (rather than hard-coded in that JS string) so the page interpolates one value
 * and the invariant below stays testable.
 */
export const HERO_FAILSAFE_MS = 8000;

/**
 * Delay after lights-out at which [data-preloader-active] is dropped, releasing the hero's
 * .fog-in. Deliberately mid-curtain, not at its start: fog-in runs 0.7s, so releasing it
 * with the lift would spend most of that reveal hidden behind an opaque overlay.
 */
export function textReleaseDelayMs(): number {
  return LIGHTS_OUT_HOLD_MS + CURTAIN_MS * TEXT_RELEASE_FRAC;
}

/** Delay after lights-out at which the overlay unmounts (the curtain has fully cleared). */
export function overlayTeardownMs(): number {
  return LIGHTS_OUT_HOLD_MS + CURTAIN_MS;
}
