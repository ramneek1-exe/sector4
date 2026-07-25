"use client";

import { useEffect, useState } from "react";
import { nextIndex } from "@/app/lib/chips";

// Peripheral spots down the left/right edges of the idle fog area (the `absolute inset-0`
// container below, i.e. the empty-state section — the chips scroll WITH the page, never
// pinned to the viewport). Positions are percentages of that container. Every spot is
// strictly EDGE-anchored (left OR right ≤ 6%) so a wide (max-w-16rem) chip never overflows
// sideways on mobile, and the vertical band is kept to 8–52% so chips (a) sit clear of the
// "Ask" heading + search bar ABOVE the section, and (b) stay within the initially-visible
// viewport rather than being stranded below the fold by the section's tall min-height.
// One chip appears at a random one of these each time, never repeating the previous spot.
const POOL: Array<{ top: string; left?: string; right?: string }> = [
  { top: "8%", left: "5%" },
  { top: "8%", right: "5%" },
  { top: "24%", left: "4%" },
  { top: "24%", right: "4%" },
  { top: "40%", left: "5%" },
  { top: "40%", right: "5%" },
  { top: "52%", left: "5%" },
  { top: "52%", right: "5%" },
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
    // Absolute within the idle fog area (not fixed) so chips scroll with the page instead of
    // sticking to the viewport, and sit inside the section — clear of the "Ask" heading above.
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
