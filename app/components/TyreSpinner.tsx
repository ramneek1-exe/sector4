"use client";

// An ORIGINAL abstract racing-slick glyph (NOT a reproduced Pirelli tyre — no Pirelli
// marks, per PRD §8): black slick + red sidewall ring (soft-compound colour coding) +
// SECTOR4 on the sidewall + rim/spokes. Used as the Ask-button loading spinner: it rolls
// in from the left, then spins in place. Reused later as the tyre glyph (M4).

const SPOKES = [0, 72, 144, 216, 288];

function TyreGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="49" fill="#0d0d0d" />
      <circle cx="50" cy="50" r="43" fill="#181818" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="#E10600" strokeWidth="3.5" />
      <defs>
        <path id="s4-tyre-arc" d="M50,50 m-33,0 a33,33 0 1,1 66,0 a33,33 0 1,1 -66,0" />
      </defs>
      <text className="font-grotesk" fill="#f2f2f2" fontSize="8" fontWeight="700" letterSpacing="0.5">
        <textPath href="#s4-tyre-arc" startOffset="0">
          SECTOR4 · SECTOR4 · SECTOR4 ·
        </textPath>
      </text>
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

/** Roll-in + spin loading tyre. Motion is CSS; reduced-motion shows it static + centred. */
export function TyreSpinner({ size = 22 }: { size?: number }) {
  return (
    <span className="tyre-rollin inline-flex">
      <span className="tyre-spin inline-flex">
        <TyreGlyph size={size} />
      </span>
    </span>
  );
}
