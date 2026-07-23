"use client";

// A dither bloom that trails the cursor, clipped to the exact shape of a text glyph.
// Fusion of two already-proven patterns in this codebase:
//  - SectorNumeral's clip-path-to-live-<text> technique (an inline SVG <clipPath>
//    containing a <text> using the SAME classes/font-size as the real visible glyph, so
//    it inherits exact font metrics with no rasterization) -- including its two hard-won
//    fixes: strip useId()'s colons before building the CSS fragment id (Safari drops an
//    unescaped url(#id:with:colons) silently), and use clip-path (not mask-image) for the
//    OUTER glyph-shape restriction, since mask-image on an ancestor of mix-blend-mode +
//    WebGL canvas content is a documented WebKit compositing bug.
//  - DitherFog's cursor-tracking radial mask (rAF-lerped CSS vars driving a soft radial
//    mask-image), for the "follows the cursor" motion.
// Structural safety: exactly ONE mask-image level (on the inner blob div, single-nested
// under the outer clip-path div) -- never two mask-images nested, which is the specific
// combination that broke Safari for SectorNumeral before its clip-path fix. Not
// independently re-verified in real Safari this session; follows the documented-safe
// structure exactly.
//
// Screen-blended (not multiply): this renders over a DARK background (the landing
// footer's ink panel), where multiply would only darken further and read as invisible.
// Screen lightens against dark, the correct analog of DitherFog/CardFog's multiply-on-
// light recipe.
import { useId, useLayoutEffect, useEffect, useRef, useState, type RefObject } from "react";
import { Dithering, type DitheringProps } from "@paper-design/shaders-react";

const INK = "#251F44"; // page's dark panel color -- opaque backing for the multiply/screen math
const BLUE = "#406cd6";
const SKY = "#459ae4";

const LAYERS: Partial<DitheringProps>[] = [
  { colorBack: INK, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.8 },
  { colorBack: INK, colorFront: SKY, shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.55 },
];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Cursor-following dither bloom, clipped to `text` rendered in `fontClassName`/`fontSize`.
 *  Mount as an absolutely-positioned child INSIDE the same element that renders the real
 *  visible text (so it automatically inherits any transform -- e.g. the footer's scroll
 *  parallax -- applied to that shared parent, no separate transform-sync needed).
 *  `targetRef` should point at that same visible-text element.
 *
 *  Alignment: SVG <text> baseline metrics and an HTML element's line-box don't share a
 *  metrics table, so a clip positioned by ASSUMING zero offset (or by diffing two
 *  ancestor boxes that happen to coincide) drifts off the visible glyph by a
 *  font-dependent amount -- confirmed on the real page, not just theoretical. The robust
 *  fix measures the clip <text>'s OWN actual rendered position (getBoundingClientRect,
 *  which SVG text elements support directly, screen-space, no getScreenCTM math needed)
 *  against the real target's rendered position, and corrects by the measured delta --
 *  this fixes the true rendered discrepancy directly, in either axis, regardless of its
 *  root cause. One correction pass: `offset` isn't a measurement-effect dependency, so
 *  applying it doesn't re-trigger the measurement (bounded, not a layout loop). */
export function WordmarkFog({
  text,
  fontClassName,
  fontSize,
  targetRef,
}: {
  text: string;
  fontClassName: string;
  fontSize: string;
  targetRef: RefObject<HTMLElement | null>;
}) {
  const reduced = useReducedMotion();
  const clipId = `wordmark-fog-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const clipTextRef = useRef<SVGTextElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: -9999, y: -9999, active: false });
  const pos = useRef({ x: -9999, y: -9999 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const correct = () => {
      const el = targetRef.current;
      const textEl = clipTextRef.current;
      if (!el || !textEl) return;
      const targetRect = el.getBoundingClientRect();
      const textRect = textEl.getBoundingClientRect();
      setOffset((o) => ({
        x: o.x + (targetRect.left - textRect.left),
        y: o.y + (targetRect.top - textRect.top),
      }));
    };
    correct();
    window.addEventListener("resize", correct);
    return () => window.removeEventListener("resize", correct);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately excludes
    // `offset`: re-running on its own change would fight the correction it just applied.
  }, [targetRef, text, fontClassName, fontSize]);

  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;
    if (!root) return;

    let ioActive = false;
    const io = new IntersectionObserver(([entry]) => { ioActive = entry.isIntersecting; }, {
      rootMargin: "100px",
    });
    io.observe(root);

    const onMove = (e: PointerEvent) => {
      if (!ioActive) {
        target.current.active = false;
        return;
      }
      const r = root.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
      target.current = inside ? { x, y, active: true } : { ...target.current, active: false };
    };
    const onLeave = () => {
      target.current.active = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const tick = () => {
      const t = target.current;
      const p = pos.current;
      if (p.x < -1000 && t.active) {
        p.x = t.x;
        p.y = t.y;
      }
      p.x += (t.x - p.x) * 0.12;
      p.y += (t.y - p.y) * 0.12;
      const el = blobRef.current;
      if (el) {
        el.style.opacity = t.active ? "1" : "0";
        el.style.setProperty("--mx", `${p.x}px`);
        el.style.setProperty("--my", `${p.y}px`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none absolute inset-0">
      <svg width="100%" height="100%" className="absolute inset-0" aria-hidden focusable="false">
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <text x={offset.x} y={offset.y} dominantBaseline="text-before-edge" className={fontClassName} style={{ fontSize }}>
              {text}
            </text>
          </clipPath>
        </defs>
        {/* Measurement proxy: an SVG element living inside <clipPath>/<defs> is never
            "rendered" per spec (only used as a geometry source), so
            getBoundingClientRect() on it always returns a zero rect -- confirmed on the
            real page, not theoretical. This identical, actually-painted (opacity 0, not
            display:none) sibling text IS laid out normally, so its rect is real and can
            be measured/corrected against the target; the correction then applies to both
            texts via the shared `offset` state, since they share the same x/y. */}
        <text
          ref={clipTextRef}
          x={offset.x}
          y={offset.y}
          dominantBaseline="text-before-edge"
          className={fontClassName}
          style={{ fontSize, opacity: 0 }}
        >
          {text}
        </text>
      </svg>
      <div
        className="absolute inset-0"
        style={{ clipPath: `url(#${clipId})`, WebkitClipPath: `url(#${clipId})` }}
      >
        <div
          ref={blobRef}
          className="absolute inset-0 opacity-0 transition-opacity duration-300"
          style={{
            mixBlendMode: "screen",
            maskImage:
              "radial-gradient(circle 180px at var(--mx, -9999px) var(--my, -9999px), black 0%, black 30%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(circle 180px at var(--mx, -9999px) var(--my, -9999px), black 0%, black 30%, transparent 75%)",
          }}
        >
          {LAYERS.map((l, i) => (
            <Dithering
              key={i}
              {...l}
              className="absolute inset-0 h-full w-full"
              style={{ mixBlendMode: "screen" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
