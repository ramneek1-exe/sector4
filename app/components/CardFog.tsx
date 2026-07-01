"use client";

import { useEffect, useRef } from "react";
import { GLYPH_DIM, glyphFor } from "@/app/lib/ascii-bitmap";
import { warpedField } from "@/app/lib/noise";

// Brand fog ramp (same as AsciiFog) — darkest navy → royal blue (palette).
const COLOR_LO = [37, 31, 68]; // --ramp-0 #251f44
const COLOR_HI = [64, 108, 214]; // --ramp-2 #406cd6
const CELL = 12; // px per dot-matrix glyph cell (a touch finer than the page fog)
const NOISE_SCALE = 0.13;
// The fog clings to the bottom + right edges and pools in the bottom-right corner — it
// reaches at most this fraction in from each edge, then falls off quadratically, so the
// interior (where the text lives) stays clear. Kept deliberately shallow + faint.
const REACH_X = 0.4; // how far in from the RIGHT edge the fog reaches at full hover
const REACH_Y = 0.42; // how far up from the BOTTOM edge the fog reaches at full hover
const GROW_MS = 520; // grow: expressive, decelerating into the extent
const RETRACT_MS = 360; // retract: subtler + faster than the grow (exits recede)

// Eased radius for the bloom feel: ease-out on the way in (already-progressing `p`).
function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

/**
 * Brand ASCII fog that blooms from the card's BOTTOM-RIGHT corner on hover and
 * recedes on hover-out (the dot-matrix field of AsciiFog, masked to a radial reveal
 * anchored at that corner). `progress` (0..1) advances toward the hover target at the
 * grow/retract rate and is eased to a capped radius, so rapid hover in/out retargets
 * smoothly without keyframe snapping. The RAF runs ONLY while the bloom is open or in
 * flight — never 8 idle canvases. Under prefers-reduced-motion it renders nothing (the
 * card's border/lift carries the hover feedback instead).
 */
export function CardFog({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(0); // hover target: 1 open, 0 closed
  const progRef = useRef(0); // current eased-input progress 0..1
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  useEffect(() => {
    targetRef.current = active ? 1 : 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const sub = CELL / GLYPH_DIM;
    const dot = Math.max(1, sub * 0.85);

    const sizeToCard = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      if (w === 0 || h === 0) return { w: 0, h: 0 };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    const draw = (prog: number, t: number, w: number, h: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const p = easeOut(prog);
      if (p <= 0) return;
      const reachX = p * w * REACH_X; // grows in from the right edge
      const reachY = p * h * REACH_Y; // grows up from the bottom edge
      if (reachX <= 0 && reachY <= 0) return;
      const cols = Math.ceil(w / CELL);
      const rows = Math.ceil(h / CELL);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = c * CELL + CELL / 2;
          const cy = r * CELL + CELL / 2;
          // Proximity to the right / bottom edges (0 at the reach limit, 1 at the edge).
          const wx = reachX > 0 && w - cx < reachX ? 1 - (w - cx) / reachX : 0;
          const wy = reachY > 0 && h - cy < reachY ? 1 - (h - cy) / reachY : 0;
          if (wx <= 0 && wy <= 0) continue;
          // Quadratic falloff hugs the edges; the cross term blooms the corner where both
          // meet. Interior cells fade to ~0 so the text stays clear.
          const ew = Math.min(1, Math.max(wx, wy) ** 2 + wx * wy * 0.7);
          if (ew <= 0.02) continue;
          const v = warpedField(c * NOISE_SCALE, r * NOISE_SCALE, t);
          const bits = glyphFor(v);
          if (!bits) continue;
          const cv = Math.min(1, v);
          const m = [0, 1, 2].map((k) => COLOR_LO[k] + (COLOR_HI[k] - COLOR_LO[k]) * cv);
          const a = (0.07 + cv * 0.23) * ew; // deliberately faint
          if (a < 0.015) continue;
          ctx.fillStyle = `rgba(${m[0] | 0},${m[1] | 0},${m[2] | 0},${a})`;
          const ox = c * CELL;
          const oy = r * CELL;
          for (let by = 0; by < GLYPH_DIM; by++) {
            for (let bx = 0; bx < GLYPH_DIM; bx++) {
              if (bits[by * GLYPH_DIM + bx]) ctx.fillRect(ox + bx * sub, oy + by * sub, dot, dot);
            }
          }
        }
      }
    };

    let dims = sizeToCard();
    // Re-measure if the card resizes mid-hover (else the backing store stays stale until
    // the next hover re-enters the effect).
    const ro = new ResizeObserver(() => {
      dims = sizeToCard();
    });
    ro.observe(canvas);

    const frame = (ms: number) => {
      const dt = lastRef.current ? ms - lastRef.current : 16;
      lastRef.current = ms;
      const target = targetRef.current;
      const rate = target > progRef.current ? dt / GROW_MS : dt / RETRACT_MS;
      if (progRef.current < target) progRef.current = Math.min(target, progRef.current + rate);
      else if (progRef.current > target) progRef.current = Math.max(target, progRef.current - rate);

      if (dims.w === 0) dims = sizeToCard();
      draw(progRef.current, ms * 0.0011, dims.w, dims.h);

      // Keep animating while open (fog churns) or still easing; otherwise settle + stop.
      if (target > 0 || progRef.current > 0) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        rafRef.current = 0;
        lastRef.current = 0;
      }
    };

    if (!rafRef.current) {
      lastRef.current = 0;
      rafRef.current = requestAnimationFrame(frame);
    }
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      ro.disconnect();
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
