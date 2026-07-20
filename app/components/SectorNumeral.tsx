"use client";

// Oversized faded timing-sheet numeral ("S1".."S4"). Decorative, but interactive on
// hover: the card-hover dither bloom (CardFog) mounts inside the numeral's box while
// the pointer is over it and unmounts at rest (WebGL budget discipline). The wrapper
// is also the track spine's anchor: [data-sector-anchor] marks the racing line's
// waypoint at this section.
import { useState } from "react";
import { CardFog } from "@/app/components/CardFog";

export function SectorNumeral({ n, className = "" }: { n: number; className?: string }) {
  const [hovered, setHovered] = useState(false);

  return (
    <span
      aria-hidden
      data-reveal
      data-sector-anchor
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={`relative isolate inline-block select-none overflow-hidden ${className}`}
    >
      <CardFog active={hovered} intensity={0.5} />
      <span className="pointer-events-none relative font-grotesk text-[7rem] font-bold leading-none tracking-tight text-ink/[0.06] sm:text-[10rem]">
        S{n}
      </span>
    </span>
  );
}
