"use client";

import { useEffect, useRef } from "react";
import { GLYPH_DIM, glyphFor } from "@/app/lib/ascii-bitmap";
import { warpedField } from "@/app/lib/noise";

// Brand ramp (globals.css :root) — dark → light blue.
const COLOR_LO = [30, 63, 208]; // --ramp-1
const COLOR_HI = [89, 200, 255]; // --ramp-3
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
          const m = [0, 1, 2].map((k) => COLOR_LO[k] + (COLOR_HI[k] - COLOR_LO[k]) * cv);
          ctx.fillStyle = `rgba(${m[0] | 0},${m[1] | 0},${m[2] | 0},${0.2 + cv * 0.5})`;
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
