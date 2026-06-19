/**
 * Which example index shows in each of `slotCount` slots at a given `cycle`. Each slot
 * is offset around the example ring so the visible chips stay distinct, and the whole set
 * advances one step per cycle (drifting rotation). Assumes total >= slotCount.
 */
export function visibleChips(cycle: number, slotCount: number, total: number): number[] {
  const stride = Math.max(1, Math.floor(total / slotCount));
  return Array.from({ length: slotCount }, (_, slot) => (cycle + slot * stride) % total);
}
