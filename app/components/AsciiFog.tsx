"use client";

import { useEffect, useRef } from "react";
import { GLYPH_DIM, glyphFor } from "@/app/lib/ascii-bitmap";

// Brand ramp (globals.css :root) — dark → light blue.
const COLOR_LO = [30, 63, 208]; // --ramp-1
const COLOR_HI = [89, 200, 255]; // --ramp-3
const CELL = 22; // px per character cell (one 5x5 dot-matrix glyph)
const FPS = 20;

/**
 * A CONFINED, ambient ASCII fog using the 1NCOGNIT0 dot-matrix glyph technique
 * (see app/lib/ascii-bitmap.ts) instead of single monospace characters — bolder,
 * more legible, and the look the owner asked for. Only lives where the action is
 * (under the query bar), drawn over the plain page background. Animated, but slow;
 * a single static frame under prefers-reduced-motion.
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
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Smooth animated value-noise from layered sines (cheap, no deps).
          const n =
            Math.sin(c * 0.45 + t) * 0.5 +
            Math.sin(r * 0.6 - t * 0.7) * 0.3 +
            Math.sin((c + r) * 0.28 + t * 0.45) * 0.2;
          const v = (n + 1) / 2; // 0..1
          const bits = glyphFor(v);
          if (!bits) continue;
          const m = [0, 1, 2].map((k) => COLOR_LO[k] + (COLOR_HI[k] - COLOR_LO[k]) * v);
          ctx.fillStyle = `rgba(${m[0] | 0},${m[1] | 0},${m[2] | 0},${0.22 + v * 0.45})`;
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
      draw(2.1); // single static frame (non-zero phase so it isn't blank)
      return () => ro.disconnect();
    }

    let raf = 0;
    let last = 0;
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      if (ms - last < 1000 / FPS) return;
      last = ms;
      draw(ms * 0.0007); // slow drift
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
