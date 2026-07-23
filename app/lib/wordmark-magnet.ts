// Pure geometry for the landing footer's cursor-magnet wordmark letters. A letter within
// `radius` px of the pointer nudges toward it with linear distance falloff, capped at
// `maxOffset`; at or beyond the radius it rests at zero. Kept pure/testable per this
// codebase's convention (logic lives in lib, not buried in component internals -- see
// track-path.ts for the precedent).
export interface Point {
  x: number;
  y: number;
}

export interface MagnetOptions {
  radius: number; // px: influence range -- letters at or beyond this distance rest at 0
  maxOffset: number; // px: offset magnitude at zero distance (pointer exactly on the letter)
}

/** Offset a letter should move toward the pointer, given the letter's own rest-position
 *  center and the pointer's current position (both in the same coordinate space, e.g.
 *  viewport / getBoundingClientRect). Zero outside `radius`, and zero exactly at the
 *  center (direction is undefined at distance 0; rather than divide by zero, rest). */
export function magnetOffset(letterCenter: Point, pointer: Point, opts: MagnetOptions): Point {
  const dx = pointer.x - letterCenter.x;
  const dy = pointer.y - letterCenter.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist >= opts.radius) return { x: 0, y: 0 };
  const falloff = 1 - dist / opts.radius; // 1 at dist=0 -> 0 at dist=radius
  const scale = (opts.maxOffset * falloff) / dist;
  return { x: dx * scale, y: dy * scale };
}

/** One step of exponential smoothing toward `target` -- the same easing shape as the
 *  hero's cursor-trailing dither blob (DitherFog). `factor` in (0,1]; higher = snappier. */
export function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}
