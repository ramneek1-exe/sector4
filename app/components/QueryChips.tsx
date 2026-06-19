"use client";

import { useEffect, useState } from "react";
import { nextIndex } from "@/app/lib/chips";

// Peripheral spots — kept clear of the centred intro copy (the vertical/horizontal middle).
// One chip appears at a random one of these each time, never repeating the previous spot.
const POOL = [
  { top: "10%", left: "16%" },
  { top: "9%", left: "42%" },
  { top: "11%", left: "70%" },
  { top: "14%", left: "86%" },
  { top: "50%", left: "9%" },
  { top: "52%", left: "91%" },
  { top: "88%", left: "22%" },
  { top: "90%", left: "50%" },
  { top: "86%", left: "78%" },
];
const CYCLE_MS = 4200; // slower cadence — one chip at a time
const FADE_MS = 3800; // animation (fade in → hold → fade out) finishes before the next appears

const chipClass =
  "rounded-full border border-white/60 bg-white/45 px-4 py-1.5 font-grotesk text-xs text-muted backdrop-blur transition hover:border-accent hover:text-ink";

export function QueryChips({ examples, onPick }: { examples: string[]; onPick: (q: string) => void }) {
  const [reduce, setReduce] = useState(false);
  const [state, setState] = useState({ step: 0, pos: 0 });

  useEffect(() => {
    const r = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduce(r);
    if (r) return;
    const id = setInterval(() => {
      setState((s) => ({ step: s.step + 1, pos: nextIndex(s.pos, POOL.length) }));
    }, CYCLE_MS);
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

  const q = examples[state.step % examples.length];
  const p = POOL[state.pos];
  return (
    <div className="pointer-events-none absolute inset-0">
      <button
        key={state.step}
        type="button"
        onClick={() => onPick(q)}
        style={{ top: p.top, left: p.left, animationDuration: `${FADE_MS}ms` }}
        className={`chip-drift pointer-events-auto absolute -translate-x-1/2 ${chipClass}`}
      >
        {q}
      </button>
    </div>
  );
}
