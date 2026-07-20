"use client";

// Oversized faded timing-sheet numeral ("S1".."S4"). Decorative, but interactive on
// hover: the card-hover dither bloom (CardFog) mounts inside the numeral's box while
// the pointer is over it and unmounts at rest (WebGL budget discipline). The wrapper
// is also the track spine's anchor: [data-sector-anchor] marks the racing line's
// waypoint at this section.
//
// CardFog's own mask is a bottom-right CORNER box (its usual card-hover shape) - fine
// on a solid card, but on a glyph it floods the negative space around/inside the
// letters instead of hugging them. So the bloom is masked a second time, to the exact
// "S{n}" glyph: an inline SVG <text> using the SAME classes as the visible numeral
// (font-grotesk font-bold, matching size/tracking) painted white-on-black into an SVG
// luminance mask - because it's the live DOM/CSS (not a rasterized image), it inherits
// the real Space Grotesk font with no risk of a substitute-font mismatch.
import { useId, useLayoutEffect, useRef, useState } from "react";
import { CardFog } from "@/app/components/CardFog";

const NUMERAL_TEXT_CLASS =
  "font-grotesk font-bold tracking-tight select-none text-[7rem] sm:text-[10rem]";

export function SectorNumeral({ n, className = "" }: { n: number; className?: string }) {
  const [hovered, setHovered] = useState(false);
  const maskId = `sector-numeral-mask-${useId()}`;
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  // SVG <text> layout (dominant-baseline) and the HTML span's own line-box don't
  // share metrics tables, so a mask <text> anchored at a guessed y drifts off the
  // VISIBLE (overflow-cropped) glyph by a font-dependent amount. Measure the real
  // span's offset from the wrapper instead of guessing, and re-measure on resize
  // (the font-size itself is responsive, sm:text-[10rem]).
  const [textTop, setTextTop] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const wrapper = wrapperRef.current;
      const text = textRef.current;
      if (!wrapper || !text) return;
      setTextTop(text.getBoundingClientRect().top - wrapper.getBoundingClientRect().top);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <span
      ref={wrapperRef}
      aria-hidden
      data-reveal
      data-sector-anchor
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={`relative isolate inline-block overflow-hidden ${className}`}
    >
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <mask id={maskId} maskUnits="objectBoundingBox" maskContentUnits="userSpaceOnUse">
            <rect x="-1000" y="-1000" width="3000" height="3000" fill="black" />
            <text
              x="0"
              y={textTop}
              dominantBaseline="text-before-edge"
              fill="white"
              className={NUMERAL_TEXT_CLASS}
            >
              S{n}
            </text>
          </mask>
        </defs>
      </svg>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ maskImage: `url(#${maskId})`, WebkitMaskImage: `url(#${maskId})` }}
      >
        <CardFog active={hovered} intensity={0.5} />
      </div>
      <span
        ref={textRef}
        className={`pointer-events-none relative leading-none text-ink/[0.06] ${NUMERAL_TEXT_CLASS}`}
      >
        S{n}
      </span>
    </span>
  );
}
