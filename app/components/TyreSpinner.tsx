"use client";

import { useEffect, useRef, useState } from "react";

// An ORIGINAL abstract racing-slick glyph (NOT a reproduced Pirelli tyre — no Pirelli
// marks, per PRD §8): black slick + red sidewall ring (soft-compound colour coding) +
// SECTOR4 on the sidewall + rim/spokes. Used as the Ask-button loading spinner: it rolls
// in from the left, spins while loading, then rolls out to the right when loading ends.
// Reused later as the tyre glyph (M4).

// 10 spokes — matches the reference F1 wheel.
const SPOKES = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
const EXIT_MS = 480; // keep mounted long enough for the roll-out to finish

function TyreGlyph({ size }: { size: number }) {
  // Below this size the curved sidewall wordmark just reads as muddy texture — drop it
  // (and keep the clean slick + red ring + rim/spokes that read well small).
  const detailed = size >= 48;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {/* dark tyre annulus — open centre so the background shows through the spokes */}
      <circle cx="50" cy="50" r="39.5" fill="none" stroke="#333333" strokeWidth="19" />
      {/* continuous white sidewall line, hugging the wheel (inner) */}
      <circle cx="50" cy="50" r="32" fill="none" stroke="#f4f4f4" strokeWidth="2.5" />
      {/* two long red compound stripes, OUTSIDE the white, on opposite sides (L/R) */}
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        stroke="#E10600"
        strokeWidth="5"
        strokeDasharray="80 51.95"
        strokeDashoffset="40"
      />
      {detailed && (
        <>
          <defs>
            <path id="s4-tyre-arc" d="M50,50 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0" />
          </defs>
          <text className="font-grotesk" fill="#f4f4f4" fontSize="7" fontWeight="700" letterSpacing="0.4">
            <textPath href="#s4-tyre-arc" startOffset="25%">SECTOR4</textPath>
          </text>
          <text className="font-grotesk" fill="#f4f4f4" fontSize="7" fontWeight="700" letterSpacing="0.4">
            <textPath href="#s4-tyre-arc" startOffset="75%">SECTOR4</textPath>
          </text>
        </>
      )}
      {/* dark rim ring */}
      <circle cx="50" cy="50" r="29" fill="none" stroke="#565656" strokeWidth="3" />
      {/* 10 open spokes — thicker + anchored to a larger hub so they read solid */}
      <g stroke="#474747" strokeWidth="3.4" strokeLinecap="butt">
        {SPOKES.map((a) => {
          const r = (a * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={50 + 13 * Math.sin(r)}
              y1={50 - 13 * Math.cos(r)}
              x2={50 + 27 * Math.sin(r)}
              y2={50 - 27 * Math.cos(r)}
            />
          );
        })}
      </g>
      {/* hub */}
      <circle cx="50" cy="50" r="13" fill="#555555" />
      <circle cx="50" cy="50" r="5" fill="#383838" />
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
      <span className={`inline-flex leading-none ${phase === "out" ? "tyre-rollout" : "tyre-rollin"}`}>
        <span className="tyre-spin inline-flex">
          <TyreGlyph size={size} />
        </span>
      </span>
    </span>
  );
}
