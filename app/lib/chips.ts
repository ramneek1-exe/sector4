/**
 * A uniformly random index in `[0, count)` that differs from `prev` (when count > 1).
 * Used to drop each suggested-query chip in a fresh spot, never repeating the spot it
 * just left. Picks over the `count - 1` other slots, then skips `prev` to stay uniform.
 */
export function nextIndex(prev: number, count: number): number {
  if (count <= 1) return 0;
  let next = Math.floor(Math.random() * (count - 1));
  if (next >= prev) next += 1;
  return next;
}
