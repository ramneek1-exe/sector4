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
      {/* tyre annulus — open centre so the background shows through the spokes */}
      <circle cx="50" cy="50" r="41" fill="none" stroke="#101010" strokeWidth="16" />
      {/* continuous white sidewall line */}
      <circle cx="50" cy="50" r="37" fill="none" stroke="#f4f4f4" strokeWidth="3" />
      {/* two red compound stripes on opposite sides (Pirelli-style soft marking) */}
      <circle
        cx="50"
        cy="50"
        r="37"
        fill="none"
        stroke="#E10600"
        strokeWidth="6"
        strokeDasharray="16 100.24"
        strokeDashoffset="8"
      />
      {detailed && (
        <>
          <defs>
            <path id="s4-tyre-arc" d="M50,50 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
          </defs>
          <text className="font-grotesk" fill="#ededed" fontSize="7.5" fontWeight="700" letterSpacing="0.5">
            <textPath href="#s4-tyre-arc" startOffset="25%">SECTOR4</textPath>
          </text>
          <text className="font-grotesk" fill="#ededed" fontSize="7.5" fontWeight="700" letterSpacing="0.5">
            <textPath href="#s4-tyre-arc" startOffset="75%">SECTOR4</textPath>
          </text>
        </>
      )}
      {/* open spokes — gaps between them let the background through */}
      <g stroke="#2c2c2c" strokeWidth="2.4" strokeLinecap="round">
        {SPOKES.map((a) => {
          const r = (a * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={50 + 11 * Math.sin(r)}
              y1={50 - 11 * Math.cos(r)}
              x2={50 + 30 * Math.sin(r)}
              y2={50 - 30 * Math.cos(r)}
            />
          );
        })}
      </g>
      {/* hub */}
      <circle cx="50" cy="50" r="11" fill="#161616" />
      <circle cx="50" cy="50" r="4" fill="#2a2a2a" />
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
