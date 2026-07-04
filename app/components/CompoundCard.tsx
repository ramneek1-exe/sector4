"use client";

import { AsciiEmblem } from "@/app/components/AsciiEmblem";
import { NarrativeText } from "@/app/components/NarrativeText";
import { COMPOUND_COLOR, COMPOUND_LETTER } from "@/app/lib/compound";
import { contrastGuard, WHITE } from "@/app/lib/contrast";
import type { CompoundFacts } from "@/app/lib/narrative";

// The dominant-compound answer: a compound-colored ASCII tyre glyph (color-coding only, no
// Pirelli marks per PRD §8) with a contrast-guarded S/M/H letter, plus the grounded,
// historical-framing narrative. The glyph sits on a dark tyre-black disc so the compound
// color reads (the near-white page washed light compounds out), the way compound colors are
// shown on a real tyre. Text uses the shared `.legible` wash and NarrativeText so it reads
// over the fog AND picks up the concept-linkify popovers, like the other answer cards.
// No glyph when there is no history.
const DISC = "#17171D"; // tyre black

export function CompoundCard({
  compound,
  narrative,
}: {
  compound: CompoundFacts;
  narrative: string;
}) {
  const c = compound.compound;
  const color = c ? COMPOUND_COLOR[c] : null;
  const name = c ? `${c[0]}${c.slice(1).toLowerCase()} compound` : null;
  return (
    <div className="fog-in flex max-w-xl flex-col items-center gap-4 px-4 py-2 text-center">
      {c && color ? (
        <div className="flex flex-col items-center gap-2">
          <div
            className="relative flex h-28 w-28 items-center justify-center rounded-full ring-1 ring-ink/10"
            style={{ background: DISC }}
          >
            <AsciiEmblem kind="tyre" color={color} size={104} cols={30} />
            <span
              className="pointer-events-none absolute inset-0 flex items-center justify-center font-grotesk text-3xl font-bold"
              style={{ color: contrastGuard(WHITE, DISC) }}
              aria-hidden="true"
            >
              {COMPOUND_LETTER[c]}
            </span>
          </div>
          <span className="legible px-2 py-0.5 font-grotesk text-xs uppercase tracking-wide text-ink/80">
            {name}
          </span>
        </div>
      ) : null}
      <NarrativeText
        narrative={narrative}
        className="legible max-w-xl px-4 py-2 font-lastik text-lg leading-relaxed text-ink/90"
      />
    </div>
  );
}
