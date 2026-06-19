"use client";

import { useEffect, useState } from "react";
import { visibleChips } from "@/app/lib/chips";

const SLOTS = 3;
// Absolute slot positions — kept to the periphery so chips never collide with the
// centred intro copy (which sits in the vertical middle). Two up top, one low-centre.
const POS = [
  { top: "8%", left: "20%" },
  { top: "8%", left: "80%" },
  { top: "90%", left: "50%" },
];
const CYCLE_MS = 2600;

const chipClass =
  "rounded-full border border-white/60 bg-white/45 px-4 py-1.5 font-grotesk text-xs text-muted backdrop-blur transition hover:border-accent hover:text-ink";

export function QueryChips({ examples, onPick }: { examples: string[]; onPick: (q: string) => void }) {
  const [reduce, setReduce] = useState(false);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const r = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduce(r);
    if (r) return;
    const id = setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  if (reduce) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {examples.slice(0, 3).map((q) => (
          <button key={q} type="button" onClick={() => onPick(q)} className={chipClass}>
            {q}
          </button>
        ))}
      </div>
    );
  }

  const shown = visibleChips(cycle, SLOTS, examples.length);
  return (
    <div className="pointer-events-none absolute inset-0">
      {shown.map((exIdx, slot) => {
        const q = examples[exIdx];
        return (
          <button
            key={`${slot}-${exIdx}`}
            type="button"
            onClick={() => onPick(q)}
            style={{ top: POS[slot].top, left: POS[slot].left }}
            className={`chip-drift pointer-events-auto absolute -translate-x-1/2 ${chipClass}`}
          >
            {q}
          </button>
        );
      })}
    </div>
  );
}
