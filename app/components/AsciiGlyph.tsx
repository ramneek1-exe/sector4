"use client";

import { useEffect, useRef, useState } from "react";
import { DriverGlyph } from "@/app/components/DriverGlyph";
import { asciiRowsFor, sampleAscii, type AsciiGrid } from "@/app/lib/ascii";
import { GLYPH_DIM, glyphFor } from "@/app/lib/ascii-bitmap";
import { resolveGlyph } from "@/app/lib/glyph";
import { HELMET_VIEWBOX, helmetSvgMarkup } from "@/app/lib/helmet";

const SS = 6; // off-screen supersample per ASCII cell
const REVEAL_MS = 420; // window over which cells scatter in
const FADE_MS = 220; // per-cell fade duration

/**
 * The driver helmet rendered AS COLOURED DOT-MATRIX ASCII (1NCOGNIT0 technique,
 * app/lib/ascii-bitmap.ts) — each cell is a 5x5 glyph picked by coverage and tinted
 * with the team colour (PRD §8). The helmet is rasterised + sampled off-screen, then
 * drawn to a canvas; the vector glyph is shown first and as the no-canvas/SSR
 * fallback. Cells dissolve in (scattered), gated behind prefers-reduced-motion.
 */
export function AsciiGlyph({
  code,
  team,
  size = 120,
  cols = 15,
}: {
  code: string;
  team: string | null;
  size?: number;
  cols?: number;
}) {
  const [grid, setGrid] = useState<AsciiGrid | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 1. Rasterise + sample the helmet off-screen.
  useEffect(() => {
    let cancelled = false;
    const g = resolveGlyph(code, team);
    const { w, h } = HELMET_VIEWBOX;
    const rows = asciiRowsFor(w, h, cols, 1); // square cells for the dot matrix
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(helmetSvgMarkup(g))}`;

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const c = document.createElement("canvas");
        c.width = cols * SS;
        c.height = rows * SS;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        setGrid(sampleAscii(data, c.width, c.height, cols, { rows }));
      } catch {
        /* tainted/unsupported canvas → keep the vector fallback */
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [code, team, cols]);

  // 2. Draw the dot-matrix to the visible canvas, with a scattered dissolve.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!grid || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cellPx = size / grid.cols;
    const heightPx = grid.rows * cellPx;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(heightPx * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${heightPx}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sub = cellPx / GLYPH_DIM;
    const dot = Math.max(1, sub * 0.9);
    // Per-cell scatter offset for the dissolve (deterministic, no hydration risk).
    const delayFor = (i: number) => ((i * 53) % 17) / 17 * REVEAL_MS;

    const paint = (alphaFor: (i: number) => number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      grid.cells.forEach((cell, i) => {
        const bits = glyphFor(cell.coverage);
        if (!bits || !cell.color) return;
        const a = alphaFor(i);
        if (a <= 0) return;
        ctx.globalAlpha = a;
        ctx.fillStyle = cell.color;
        const ox = (i % grid.cols) * cellPx;
        const oy = Math.floor(i / grid.cols) * cellPx;
        for (let by = 0; by < GLYPH_DIM; by++) {
          for (let bx = 0; bx < GLYPH_DIM; bx++) {
            if (bits[by * GLYPH_DIM + bx]) ctx.fillRect(ox + bx * sub, oy + by * sub, dot, dot);
          }
        }
      });
      ctx.globalAlpha = 1;
    };

    if (reduce) {
      paint(() => 1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      paint((i) => Math.max(0, Math.min(1, (t - delayFor(i)) / FADE_MS)));
      if (t < REVEAL_MS + FADE_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [grid, size]);

  // Vector fallback: server render, while sampling, or if canvas is unavailable.
  if (!grid) return <DriverGlyph code={code} team={team} size={size} />;
  return <canvas ref={canvasRef} role="img" aria-label={`${code} helmet`} />;
}
