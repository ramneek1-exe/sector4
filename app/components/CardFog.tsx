"use client";

// Locked dither warp recipe (docs/superpowers/plans/2026-07-18-dither-shader-swap.md,
// spec §0), ported from the /lab/dither evaluation (app/lab/dither/LabDither.tsx —
// DitherHoverCard). Same hero blue+sky warp layers as DitherFog, masked to the card's
// bottom-right corner instead of filling the box.
import { useEffect, useRef, useState } from "react";
import { Dithering, type DitheringProps } from "@paper-design/shaders-react";

const WHITE = "#fafafa"; // page surface; multiply-blended layers pass it through
const BLUE = "#406cd6";
const SKY = "#459ae4";

const BLOOM_LAYERS: Partial<DitheringProps>[] = [
  { colorBack: WHITE, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.8 },
  { colorBack: WHITE, colorFront: SKY, shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.55 },
];

// Bottom-right corner reveal (CardFog's traditional placement).
const CARD_MASK = "radial-gradient(120% 120% at 100% 100%, black 0%, black 35%, transparent 72%)";
const FADE_MS = 500;

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

/**
 * Brand dither bloom that appears in a card's bottom-right corner while `active`
 * (hover/focus), fading out over FADE_MS after deactivation. The two warp layers (the
 * same blue + sky recipe as DitherFog's hero) sit inside a corner-masked wrapper carrying
 * `mixBlendMode: "multiply"` — the mask creates its own stacking context, so the wrapper
 * blend is what multiplies the bloom against the card; the layers ALSO carry their own
 * multiply so the two colours accumulate against each other within that context, exactly
 * as the lab's DitherLayers does.
 *
 * Mounted ONLY while `active` or mid-fade-out, then unmounted entirely (WebGL contexts
 * freed) — /learn is a card grid, so at-rest cards must not hold a live context each.
 * Reduced motion: shown as a static frame (speed 0) rather than suppressed outright.
 */
export function CardFog({ active }: { active: boolean }) {
  const [mounted, setMounted] = useState(active);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();
  const speedFactor = reduced ? 0 : 1;

  useEffect(() => {
    if (active) {
      if (fadeTimer.current) {
        clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }
      setMounted(true);
      return;
    }
    fadeTimer.current = setTimeout(() => setMounted(false), FADE_MS);
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [active]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity"
      style={{
        opacity: active ? 1 : 0,
        transitionDuration: `${FADE_MS}ms`,
        mixBlendMode: "multiply",
        maskImage: CARD_MASK,
        WebkitMaskImage: CARD_MASK,
      }}
    >
      {BLOOM_LAYERS.map((l, i) => (
        <Dithering
          key={i}
          {...l}
          speed={(l.speed ?? 0.5) * speedFactor}
          className="absolute inset-0 h-full w-full"
          style={{ mixBlendMode: "multiply" }}
        />
      ))}
    </div>
  );
}
