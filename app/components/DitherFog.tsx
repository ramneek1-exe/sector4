"use client";

// Locked hero recipe (docs/superpowers/plans/2026-07-18-dither-shader-swap.md, spec §0),
// ported from the /lab/dither evaluation (app/lab/dither/LabDither.tsx — DitherLayers +
// DitherHeroPanel). Two white-backed Dithering layers stacked with multiply so the palette
// warp accumulates over the page (the AsciiFog fog-on-white treatment), plus a soft accent
// blob that trails the cursor. Params are exact — do not retune without re-running the lab.
import { useEffect, useRef } from "react";
import { Dithering } from "@paper-design/shaders-react";
import { WHITE, ACCENT, WARP_LAYERS } from "@/app/lib/dither-recipe";
import { useReducedMotion } from "@/app/lib/use-reduced-motion";

/** White-backed Dithering layers, multiply-stacked so the palette accumulates over white. */
function DitherLayers({ speedFactor }: { speedFactor: number }) {
  return (
    <>
      {WARP_LAYERS.map((l, i) => (
        <Dithering
          key={i}
          {...l}
          speed={(l.speed ?? 0.5) * speedFactor}
          className="absolute inset-0 h-full w-full"
          style={{ mixBlendMode: "multiply" }}
        />
      ))}
    </>
  );
}

/**
 * Site-wide hero fog: the two-layer warp dither, plus an accent blob that trails the
 * cursor (rAF-lerped CSS vars driving a soft radial mask). Fills its box like AsciiFog
 * (`{ className }` mirrors that API). Multiply is applied to the masked WRAPPER, never to
 * a canvas inside the mask — a mask creates its own stacking context, which isolates inner
 * blend modes and renders as a visible white circle instead of blending through.
 * Reduced motion: speed 0 on both base layers, blob disabled entirely.
 */
export function DitherFog({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const speedFactor = reduced ? 0 : 1;
  const interactive = !reduced;

  const rootRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: -9999, y: -9999, active: false });
  const pos = useRef({ x: -9999, y: -9999 });

  // Track the cursor on WINDOW (AsciiFog's pattern): the fog is mounted as a
  // pointer-events-none background SIBLING behind the page content, so React mouse
  // handlers on the fog root never fire — events target the content tree. Local
  // coords come from the root's rect; `active` = cursor inside the fog's box.
  useEffect(() => {
    if (!interactive) return;
    const onMove = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
      target.current = inside ? { x, y, active: true } : { ...target.current, active: false };
    };
    const onLeave = () => {
      target.current = { ...target.current, active: false };
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    let raf = 0;
    const tick = () => {
      const t = target.current;
      const p = pos.current;
      // Snap to the first entry point instead of lerping in from off-panel.
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
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [interactive]);

  return (
    <div ref={rootRef} aria-hidden className={`relative overflow-hidden ${className}`}>
      <DitherLayers speedFactor={speedFactor} />
      {interactive && (
        <div
          ref={blobRef}
          className="absolute inset-0 opacity-0 transition-opacity duration-300"
          style={{
            // multiply on the MASKED WRAPPER: the mask creates a stacking context that
            // isolates blending, so an inner multiply blended against transparent and the
            // white back showed as a visible circle. Blending the wrapper as a unit
            // multiplies the white out against the panel instead.
            mixBlendMode: "multiply",
            maskImage:
              "radial-gradient(circle 130px at var(--mx, -9999px) var(--my, -9999px), black 0%, black 30%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(circle 130px at var(--mx, -9999px) var(--my, -9999px), black 0%, black 30%, transparent 75%)",
          }}
        >
          <Dithering
            colorBack={WHITE}
            colorFront={ACCENT}
            shape="warp"
            type="4x4"
            size={2}
            speed={0.9 * speedFactor}
            scale={0.5}
            className="absolute inset-0 h-full w-full"
          />
        </div>
      )}
    </div>
  );
}
