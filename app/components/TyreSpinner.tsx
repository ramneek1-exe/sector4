"use client";

import { useEffect, useRef, useState } from "react";

// An ORIGINAL abstract racing-slick glyph (NOT a reproduced Pirelli tyre — no Pirelli
// marks, per PRD §8): black slick + red sidewall ring (soft-compound colour coding) +
// SECTOR4 on the sidewall + rim/spokes. Used as the Ask-button loading spinner: it rolls
// in from the left, spins while loading, then rolls out to the right when loading ends.
// Reused later as the tyre glyph (M4).

const SPOKES = [0, 72, 144, 216, 288];
const EXIT_MS = 480; // keep mounted long enough for the roll-out to finish

function TyreGlyph({ size }: { size: number }) {
  // Below this size the curved sidewall wordmark just reads as muddy texture — drop it
  // (and keep the clean slick + red ring + rim/spokes that read well small).
  const detailed = size >= 48;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="49" fill="#0d0d0d" />
      <circle cx="50" cy="50" r="43" fill="#181818" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="#E10600" strokeWidth="3.5" />
      {detailed && (
        <>
          <defs>
            <path id="s4-tyre-arc" d="M50,50 m-33,0 a33,33 0 1,1 66,0 a33,33 0 1,1 -66,0" />
          </defs>
          <text className="font-grotesk" fill="#f2f2f2" fontSize="8" fontWeight="700" letterSpacing="0.5">
            <textPath href="#s4-tyre-arc" startOffset="0">
              SECTOR4 · SECTOR4 · SECTOR4 ·
            </textPath>
          </text>
        </>
      )}
      <circle cx="50" cy="50" r="24" fill="#1e1e1e" />
      <g stroke="#363636" strokeWidth="2.6" strokeLinecap="round">
        {SPOKES.map((a) => {
          const r = (a * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={50 + 9 * Math.sin(r)}
              y1={50 - 9 * Math.cos(r)}
              x2={50 + 21 * Math.sin(r)}
              y2={50 - 21 * Math.cos(r)}
            />
          );
        })}
      </g>
      <circle cx="50" cy="50" r="8" fill="#2a2a2a" />
      {/* balance mark — an asymmetric cue so the spin reads clearly */}
      <circle cx="50" cy="20" r="2.4" fill="#E10600" />
    </svg>
  );
}

/**
 * Loading tyre keyed off `active`: rolls in from the left while loading, spins, then rolls
 * out to the right once `active` goes false (staying mounted through the exit). Renders
 * nothing when fully idle. Motion is CSS; reduced-motion shows it static, no roll/spin.
 */
export function TyreSpinner({ active, size = 22 }: { active: boolean; size?: number }) {
  const [phase, setPhase] = useState<"idle" | "in" | "out">("idle");
  const shown = useRef(false);

  useEffect(() => {
    if (active) {
      shown.current = true;
      setPhase("in");
    } else if (shown.current) {
      shown.current = false;
      setPhase("out");
      const t = setTimeout(() => setPhase("idle"), EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [active]);

  if (phase === "idle") return null;
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      <span className={phase === "out" ? "tyre-rollout" : "tyre-rollin"}>
        <span className="tyre-spin inline-flex">
          <TyreGlyph size={size} />
        </span>
      </span>
    </span>
  );
}
