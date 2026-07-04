"use client";

import { AsciiEmblem } from "@/app/components/AsciiEmblem";
import { COMPOUND_COLOR, COMPOUND_LETTER } from "@/app/lib/compound";
import { contrastGuard, INK } from "@/app/lib/contrast";
import type { CompoundFacts } from "@/app/lib/narrative";

// The dominant-compound answer: a compound-colored ASCII tyre glyph (color-coding only, no
// Pirelli marks per PRD §8) with a contrast-guarded S/M/H letter, plus the grounded,
// historical-framing narrative. No glyph when there is no history.
export function CompoundCard({
  compound,
  narrative,
}: {
  compound: CompoundFacts;
  narrative: string;
}) {
  const c = compound.compound;
  const color = c ? COMPOUND_COLOR[c] : null;
  return (
    <div className="fog-in flex max-w-xl flex-col items-center gap-4 px-4 py-2 text-center">
      {c && color ? (
        <div className="relative h-28 w-28">
          <AsciiEmblem kind="tyre" color={color} size={112} cols={30} className="h-28 w-28" />
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center font-grotesk text-3xl font-bold"
            style={{ color: contrastGuard(INK, color) }}
            aria-hidden="true"
          >
            {COMPOUND_LETTER[c]}
          </span>
        </div>
      ) : null}
      <p className="font-lastik text-lg text-ink">{narrative}</p>
    </div>
  );
}
