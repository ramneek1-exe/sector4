"use client";

// The dither drop shadow beneath the landing intro helmet (app/components/RadioHelmet.tsx).
// Same locked warp recipe as DitherFog and CardFog, masked to a flat ellipse so it reads as
// a pool on the ground rather than a halo. Lifecycle mirrors CardFog: mounted only while
// active or mid-fade-out, then unmounted so the WebGL context is freed.
import { useEffect, useRef, useState } from "react";
import { Dithering } from "@paper-design/shaders-react";
import { WARP_LAYERS } from "@/app/lib/dither-recipe";
import { useReducedMotion } from "@/app/lib/use-reduced-motion";

// `closest-side` sizing is load-bearing, the same lesson as the .legible scrim: a default
// (farthest-corner) ellipse only reaches transparent at the box CORNERS, so the box edge
// slices the gradient mid-alpha and a hard rectangle appears over the warp. closest-side
// inscribes the ellipse, so alpha is exactly 0 at every side and no edge can exist.
const SHADOW_MASK =
  "radial-gradient(ellipse closest-side at 50% 50%, black 0%, black 18%, transparent 78%)";
const FADE_MS = 500;

export function DitherShadow({ active, intensity = 0.55 }: { active: boolean; intensity?: number }) {
  const [mounted, setMounted] = useState(active);
  // `shown` starts false so the browser paints an opacity-0 frame before the flip — without
  // it the wrapper mounts already at full opacity and the fade-IN never runs (pops in).
  const [shown, setShown] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();
  const speedFactor = reduced ? 0 : 1;

  useEffect(() => {
    if (!mounted) {
      setShown(false);
      return;
    }
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [mounted]);

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
        opacity: active && shown ? intensity : 0,
        transitionDuration: `${FADE_MS}ms`,
        // multiply on the MASKED WRAPPER, never only on a canvas inside it: a mask creates
        // its own stacking context, which isolates inner blend modes and renders as a
        // visible white shape instead of blending through.
        mixBlendMode: "multiply",
        maskImage: SHADOW_MASK,
        WebkitMaskImage: SHADOW_MASK,
      }}
    >
      {WARP_LAYERS.map((l, i) => (
        <Dithering
          key={i}
          {...l}
          speed={(l.speed ?? 0.5) * speedFactor}
          className="absolute inset-0 h-full w-full"
          // The layers ALSO carry multiply so the two colours accumulate against each other
          // inside the mask's stacking context, exactly as DitherFog and CardFog do.
          style={{ mixBlendMode: "multiply" }}
        />
      ))}
    </div>
  );
}
