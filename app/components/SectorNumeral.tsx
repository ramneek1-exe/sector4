"use client";

// Oversized faded timing-sheet numeral ("S1".."S4"). Decorative, but interactive on
// hover: the card-hover dither bloom (CardFog) mounts inside the numeral's box while
// the pointer is over it and unmounts at rest (WebGL budget discipline). The wrapper
// is also the track spine's anchor: [data-sector-anchor] marks the racing line's
// waypoint at this section.
//
// CardFog's own mask is a bottom-right CORNER box (its usual card-hover shape) - fine
// on a solid card, but on a glyph it floods the negative space around/inside the
// letters instead of hugging them. So the bloom is clipped a second time, to the
// exact "S{n}" glyph: an inline SVG <clipPath> containing a <text> using the SAME
// classes as the visible numeral (font-grotesk font-bold, matching size/tracking) -
// because it's the live DOM/CSS (not a rasterized image), it inherits the real Space
// Grotesk font with no risk of a substitute-font mismatch.
//
// clip-path, not mask-image: CardFog's subtree has its OWN mask-image (a corner
// gradient) plus mix-blend-mode on its WebGL canvases. Safari's rendering pipeline
// unreliably composites a CSS `mask-image` applied to an ANCESTOR of blend-mode/
// GPU-composited content - it's a known WebKit weak spot (mask needs a luminance
// composite into the blend group; blend-mode content gets its own compositing layer
// that ancestor masks don't always apply to). `clip-path` sidesteps this: it's a
// hard geometric clip of the paint region, resolved before blending/compositing
// happens, so it isn't subject to the same cross-layer luminance-mask limitation.
// (An earlier fix attempt corrected an unescaped-colon useId() bug in the mask's
// fragment id - real bug, but not THIS one; kept fixed regardless since it's a
// separate, valid issue.)
import { useId, useLayoutEffect, useRef, useState } from "react";
import { CardFog } from "@/app/components/CardFog";

const NUMERAL_TEXT_CLASS =
  "font-grotesk font-bold tracking-tight select-none text-[7rem] sm:text-[10rem]";

export function SectorNumeral({ n, className = "" }: { n: number; className?: string }) {
  const [hovered, setHovered] = useState(false);
  // React's useId() emits ids containing colons (e.g. ":r4:") - valid as a raw HTML
  // `id` attribute, but a CSS fragment reference (`url(#id)`) requires them escaped
  // as CSS identifiers. Strip to CSS-identifier-safe characters rather than trusting
  // url() to escape it (a real, separate bug from the clip-path fix below).
  const clipId = `sector-numeral-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
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
      <svg
        width="100%"
        height="100%"
        className="pointer-events-none absolute inset-0"
        aria-hidden
        focusable="false"
      >
        <defs>
          {/* clipPathUnits="userSpaceOnUse" (the default, but explicit): the <text>
              is positioned in the wrapper's own pixel coordinate system, matching
              `textTop`'s measurement. No background rect needed (unlike the old
              mask) - clip-path has no "everything else" fill to define; only the
              glyph outline itself is ever an eligible paint region. */}
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <text x="0" y={textTop} dominantBaseline="text-before-edge" className={NUMERAL_TEXT_CLASS}>
              S{n}
            </text>
          </clipPath>
        </defs>
      </svg>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ clipPath: `url(#${clipId})`, WebkitClipPath: `url(#${clipId})` }}
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
