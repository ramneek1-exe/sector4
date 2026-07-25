"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { nextIndex } from "@/app/lib/chips";

// Peripheral spots down the left/right edges — clear of the centred intro copy. Positions
// are percentages of the VIEWPORT-bounded container below (fixed, under the nav), NOT of the
// idle section, whose 600px min-height runs well past the fold on a laptop viewport and used
// to strand the bottom-band chips off-screen. Every spot is strictly EDGE-anchored (left OR
// right ≤ 6%) so a wide (max-w-16rem) chip never overflows sideways on mobile, and the
// vertical band stops at 78% so a two-line chip stays fully on-screen even on short viewports.
// One chip appears at a random one of these each time, never repeating the previous spot.
const POOL: Array<{ top: string; left?: string; right?: string }> = [
  { top: "6%", left: "5%" },
  { top: "6%", right: "5%" },
  { top: "22%", left: "3%" },
  { top: "22%", right: "3%" },
  { top: "40%", left: "5%" },
  { top: "40%", right: "5%" },
  { top: "60%", left: "5%" },
  { top: "60%", right: "5%" },
  { top: "78%", left: "5%" },
  { top: "78%", right: "5%" },
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
  if (typeof document === "undefined") return null;
  // Portal to <body>: the container is position:fixed so its coordinates are viewport-
  // relative (chip positions are % of the viewport below the nav) — guaranteeing each chip
  // renders on-screen regardless of the taller idle section. It MUST be portalled because
  // an ancestor transform (the fog-in reveal wrapper) would otherwise become the fixed
  // element's containing block and pin it to the section instead of the viewport. Decorative
  // / pointer-events-none; the chip button re-enables pointer events. Under nav (z-30) and
  // any modal (z-50); only mounted in the idle state, so it never lingers.
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[68px] z-10">
      <button
        key={state.step}
        type="button"
        onClick={() => onPick(q)}
        style={{ ...p, animationDuration: `${FADE_MS}ms` }}
        className={`chip-drift pointer-events-auto absolute ${chipClass}`}
      >
        <span className="line-clamp-2">{q}</span>
      </button>
    </div>,
    document.body,
  );
}
