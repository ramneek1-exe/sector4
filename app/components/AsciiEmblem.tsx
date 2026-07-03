"use client";

import { useEffect, useRef, useState } from "react";
import { asciiRowsFor, sampleAscii, type AsciiCell, type AsciiGrid } from "@/app/lib/ascii";
import { scatterDelay } from "@/app/lib/scatter";
import { emblemViewBox, emblemSvgMarkup, type EmblemKind } from "@/app/lib/emblems";
import { CAR_SILHOUETTE } from "@/app/lib/car-silhouette";

const SS = 5; // off-screen supersample per ASCII cell
const REVEAL_MS = 560; // window over which cells scatter in
const FADE_MS = 340; // per-cell develop
const CAR_COLOR = "#406CD6"; // brand blue (palette --ramp-2) — silhouette rendered monochrome

function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

// Build an ASCII grid for the car straight from the silhouette coverage bitmap, block-
// averaged down to `targetCols` (so the same source serves the tiny marker + the large
// watermark). Monochrome brand blue — no livery/marks (PRD §8).
function carGrid(targetCols: number): AsciiGrid {
  const { cols, rows, data } = CAR_SILHOUETTE;
  const tCols = Math.max(1, Math.min(targetCols, cols));
  const scale = cols / tCols;
  // ceil (not round) so the last partial row is covered — otherwise the wheel bottoms get
  // clipped at small marker sizes where rows/scale isn't close to a whole number.
  const tRows = Math.max(1, Math.ceil(rows / scale));
  const cov = (i: number) => parseInt(data[i] || "0", 16) / 15;
  const cells: AsciiCell[] = [];
  for (let r = 0; r < tRows; r++) {
    for (let c = 0; c < tCols; c++) {
      const x0 = Math.floor(c * scale);
      const x1 = Math.min(cols, Math.ceil((c + 1) * scale));
      const y0 = Math.floor(r * scale);
      const y1 = Math.min(rows, Math.ceil((r + 1) * scale));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += cov(y * cols + x);
          n++;
        }
      }
      const coverage = n ? sum / n : 0;
      cells.push(
        coverage > 0.12
          ? { ch: "#", color: CAR_COLOR, coverage }
          : { ch: "", color: null, coverage: 0 },
      );
    }
  }
  return { cols: tCols, rows: tRows, cells };
}

/**
 * An abstract brand emblem (tyre / car / airflow) rendered as a coloured ASCII/dither
 * field (PRD §8) — the same rasterise → sample → coverage-square technique as the driver
 * helmets, but for the learning-layer group emblems. `animate` scatter-resolves it in on
 * mount (used for the small index markers); static otherwise (used for the large faded
 * watermark behind a concept page). Opacity/size are controlled by the caller's className.
 * Decorative + aria-hidden; the surrounding text carries the meaning.
 */
export function AsciiEmblem({
  kind,
  size = 120,
  cols = 28,
  animate = true,
  className = "",
  color,
}: {
  kind: EmblemKind;
  size?: number;
  cols?: number;
  animate?: boolean;
  className?: string;
  color?: string;
}) {
  const [grid, setGrid] = useState<AsciiGrid | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 1. Build the ASCII grid: the car comes from the silhouette bitmap; the tyre + airflow
  //    are rasterised from their SVG off-screen and sampled.
  useEffect(() => {
    if (kind === "car") {
      setGrid(carGrid(cols));
      return;
    }
    let cancelled = false;
    const { w, h } = emblemViewBox(kind);
    const rows = asciiRowsFor(w, h, cols, 1); // square cells
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(emblemSvgMarkup(kind, color))}`;
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
        setGrid(sampleAscii(data, c.width, c.height, cols, { rows, threshold: 0.12 }));
      } catch {
        /* tainted/unsupported canvas → leave the (empty) placeholder */
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [kind, cols, color]);

  // 2. Draw the dither field, optionally with a scattered develop reveal.
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

    const fillRatio = (cov: number) => Math.min(1, 0.45 + cov * 0.85);
    const paint = (progress: (i: number) => number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      grid.cells.forEach((cell, i) => {
        if (cell.coverage <= 0 || !cell.color) return;
        const p = progress(i);
        if (p <= 0) return;
        const ox = (i % grid.cols) * cellPx;
        const oy = Math.floor(i / grid.cols) * cellPx;
        const s = cellPx * fillRatio(cell.coverage) * easeOut(p);
        const off = (cellPx - s) / 2;
        ctx.globalAlpha = Math.min(1, p * 1.2);
        ctx.fillStyle = cell.color;
        ctx.fillRect(ox + off, oy + off, s, s);
      });
      ctx.globalAlpha = 1;
    };

    if (reduce || !animate) {
      paint(() => 1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const delayFor = (i: number) => scatterDelay(i, REVEAL_MS);
    const tick = (now: number) => {
      const t = now - start;
      paint((i) => Math.max(0, Math.min(1, (t - delayFor(i)) / FADE_MS)));
      if (t < REVEAL_MS + FADE_MS + 120) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [grid, size, animate]);

  if (!grid) {
    // Reserve the eventual height so the canvas doesn't pop in (square SVG emblems render
    // ~`size` tall; the car keeps the silhouette's aspect).
    const aspect = kind === "car" ? CAR_SILHOUETTE.rows / CAR_SILHOUETTE.cols : 1;
    return <div aria-hidden style={{ width: size, height: size * aspect }} className={className} />;
  }
  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
