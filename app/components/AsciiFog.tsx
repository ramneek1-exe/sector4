"use client";

import { useEffect, useRef } from "react";

// Brand ramp (globals.css :root) — dark → light blue.
const RAMP_CHARS = " .:-=+*#%";
const COLOR_LO = [30, 63, 208]; // --ramp-1
const COLOR_HI = [89, 200, 255]; // --ramp-3
const CELL = 15; // px per character cell
const FPS = 20;

/**
 * A CONFINED, ambient ASCII fog. Unlike the page background, this only lives
 * where the action is — behind the query result, under the bar. Canvas-rendered
 * (so it shows without WebGPU, unlike the `shaders` Ascii node) and kept faint +
 * slow so it reads as texture, never an attention-seeker. Static single frame
 * under prefers-reduced-motion.
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
      ctx.font = `${CELL}px var(--font-mono), monospace`;
      ctx.textBaseline = "top";
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Smooth animated value-noise from layered sines (cheap, no deps).
          const n =
            Math.sin(c * 0.35 + t) * 0.5 +
            Math.sin(r * 0.5 - t * 0.7) * 0.3 +
            Math.sin((c + r) * 0.2 + t * 0.4) * 0.2;
          const v = (n + 1) / 2; // 0..1
          const ci = Math.min(RAMP_CHARS.length - 1, Math.floor(v * RAMP_CHARS.length));
          const ch = RAMP_CHARS[ci];
          if (ch === " ") continue;
          const m = [0, 1, 2].map((k) => COLOR_LO[k] + (COLOR_HI[k] - COLOR_LO[k]) * v);
          ctx.fillStyle = `rgba(${m[0] | 0},${m[1] | 0},${m[2] | 0},${0.05 + v * 0.13})`;
          ctx.fillText(ch, c * CELL, r * CELL);
        }
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    if (reduce) {
      draw(0); // single static frame
      return () => ro.disconnect();
    }

    let raf = 0;
    let last = 0;
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      if (ms - last < 1000 / FPS) return;
      last = ms;
      draw(ms * 0.0006); // slow drift
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
