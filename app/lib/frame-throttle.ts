// A pure elapsed-time gate for rAF loops that don't need to do their expensive
// work on every tick — e.g. DitherVideo's paint loop, which re-dithers a video
// frame that itself only updates at the source encode's real frame rate.
// requestAnimationFrame still fires every display refresh (cheap, keeps existing
// pause/visibility semantics); this decides whether the tick should also do the
// expensive work.
export function shouldPaint(now: number, lastPaint: number, minIntervalMs: number): boolean {
  return now - lastPaint >= minIntervalMs;
}
