/**
 * Deterministic hashed reveal delay for cell `i`, in `[0, span)`. Replaces the old
 * `(i*73) % 23` which produced only 23 delay buckets (cells popped in visible clumps).
 * An integer-hash mix gives an effectively uniform per-cell delay — true scatter — while
 * staying deterministic (no Math.random → no hydration mismatch).
 */
export function scatterDelay(i: number, span: number): number {
  let h = i | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 0x100000000) * span;
}
