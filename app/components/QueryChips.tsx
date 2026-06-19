"use client";

import { useEffect, useState } from "react";
import { nextIndex } from "@/app/lib/chips";

// Peripheral spots in the top/bottom bands — clear of the centred intro copy. Each is
// EDGE-anchored (left OR right) so a wide chip never overflows or bunches near an edge.
// One chip appears at a random one of these each time, never repeating the previous spot.
const POOL: Array<{ top: string; left?: string; right?: string }> = [
  { top: "8%", left: "6%" },
  { top: "8%", right: "6%" },
  { top: "20%", left: "3%" },
  { top: "20%", right: "3%" },
  { top: "12%", left: "42%" },
  { top: "84%", left: "6%" },
  { top: "84%", right: "6%" },
  { top: "90%", left: "40%" },
  { top: "88%", right: "30%" },
];
const CYCLE_MS = 4200; // slower cadence — one chip at a time
const FADE_MS = 3800; // animation (fade in → hold → fade out) finishes before the next appears

// Clamp lives on an inner <span>: the animated chip is position:absolute, which
// blockifies `display:-webkit-box` to flow-root and silently disables line-clamp.
const chipClass =
  "max-w-[16rem] rounded-2xl border border-ink/10 bg-white/90 px-4 py-2 text-left font-grotesk text-xs leading-snug text-ink/80 shadow-sm backdrop-blur transition hover:border-accent hover:text-ink";

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
            <span className="line-clamp-2">{q}</span>
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
        style={{ ...p, animationDuration: `${FADE_MS}ms` }}
        className={`chip-drift pointer-events-auto absolute ${chipClass}`}
      >
        <span className="line-clamp-2">{q}</span>
      </button>
    </div>
  );
}
