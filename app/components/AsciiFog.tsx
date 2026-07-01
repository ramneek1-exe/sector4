"use client";

import { useEffect, useRef } from "react";
import { GLYPH_DIM, glyphFor } from "@/app/lib/ascii-bitmap";
import { warpedField } from "@/app/lib/noise";

// Full palette (coolors bee2f0-459ae4-2f2e89-addcef-406cd6-251f44), ordered dark → light so
// the fog sweeps the whole spectrum as a gradient.
const PALETTE: number[][] = [
  [37, 31, 68], // #251f44
  [47, 46, 137], // #2f2e89
  [64, 108, 214], // #406cd6
  [69, 154, 228], // #459ae4
  [173, 220, 239], // #addcef
  [190, 226, 240], // #bee2f0
];

// Colour at position t in [0,1] across the full palette (linear between adjacent stops).
function paletteAt(t: number): number[] {
  const x = Math.max(0, Math.min(1, t)) * (PALETTE.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = PALETTE[i];
  const b = PALETTE[Math.min(PALETTE.length - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const CELL = 16; // px per character cell (one 5x5 dot-matrix glyph)
const FPS = 30;
const NOISE_SCALE = 0.09; // lower = larger, smoother blobs
const MOUSE_RADIUS = 200; // px of cursor influence
const MOUSE_GAIN = 0.85; // how much the cursor brightens the field

/**
 * Confined, cursor-reactive ASCII fog. The field is domain-warped FBM (app/lib/
 * noise.ts) — it churns and folds organically rather than scrolling as a fixed
 * pattern — quantised into 1NCOGNIT0 dot-matrix glyphs (app/lib/ascii-bitmap.ts).
 * The cursor brightens the field within a radius (inspired by the reactbits Dither
 * background). Lives only in the action zone, over the plain page background.
 * Static single frame and no pointer reactivity under prefers-reduced-motion.
 */
export function AsciiFog({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cols = 0;
    let rows = 0;
    const mouse = { x: -1e4, y: -1e4, a: 0 }; // a = influence amount, eased

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      if (w === 0 || h === 0) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      cols = Math.ceil(w / CELL);
      rows = Math.ceil(h / CELL);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const sub = CELL / GLYPH_DIM;
    const dot = Math.max(1, sub * 0.85);

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mc = mouse.x / CELL;
      const mr = mouse.y / CELL;
      const radCells = MOUSE_RADIUS / CELL;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let v = warpedField(c * NOISE_SCALE, r * NOISE_SCALE, t);
          if (mouse.a > 0) {
            const d = Math.hypot(c - mc, r - mr) / radCells;
            if (d < 1) v += (1 - d) * (1 - d) * MOUSE_GAIN * mouse.a;
          }
          const bits = glyphFor(v);
          if (!bits) continue;
          const cv = Math.min(1, v);
          // Diagonal sweep across the full palette, nudged by the field so it reads organic.
          // The ^1.6 curve biases the field toward the darker/mid blues (which hold up on the
          // light page) so the pale end only surfaces near the far corner — a balanced fog
          // rather than a washed-out one.
          const pos = (c / Math.max(1, cols) + r / Math.max(1, rows)) / 2;
          const m = paletteAt(Math.pow(pos * 0.72 + cv * 0.28, 1.6));
          ctx.fillStyle = `rgba(${m[0] | 0},${m[1] | 0},${m[2] | 0},${Math.min(1, 0.32 + cv * 0.62)})`;
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

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    if (reduce) {
      draw(12.3); // single static frame
      return () => ro.disconnect();
    }

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.a = 1;
    };
    const onLeave = () => {
      mouse.a = 0;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    let raf = 0;
    let last = 0;
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      if (ms - last < 1000 / FPS) return;
      last = ms;
      draw(ms * 0.0009); // slow drift
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
