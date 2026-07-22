"use client";

import { useEffect, useRef, useState } from "react";
import { bayerCells, type BayerCell } from "@/app/lib/bayer";
import { emblemViewBox, emblemSvgMarkup, type EmblemKind, type SvgEmblem } from "@/app/lib/emblems";
import { CAR_SILHOUETTE } from "@/app/lib/car-silhouette";

const REVEAL_MS = 450; // dither-resolve reveal duration
const CAR_COLOR = "#406CD6"; // brand blue (palette --ramp-2) — silhouette rendered monochrome
// Default sampling grid width when the caller doesn't pin `cols` (pre-dither-swap value,
// restored: a since-regressed refactor derived the grid from `size` at 1px/cell instead,
// which samples at native resolution -- the only visible "dither" then is antialiasing
// noise at the edge, reading as flecks/specks rather than deliberate pixel art).
const DEFAULT_COLS = 28;

function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

// Aspect ratio (h/w) for the placeholder box reserved while the grid samples.
function emblemAspect(kind: EmblemKind): number {
  if (kind === "car") return CAR_SILHOUETTE.rows / CAR_SILHOUETTE.cols;
  const { w, h } = emblemViewBox(kind as SvgEmblem);
  return h / w;
}

// Draw the car silhouette coverage bitmap to an offscreen canvas at its native
// resolution (coverage → alpha, brand-blue fill), then scale that onto a second
// offscreen canvas at the target grid size so the Bayer pass reads a clean alpha
// field regardless of target size. Monochrome brand blue — no livery/marks (PRD §8).
function carImageData(gCols: number, gRows: number, color: string): ImageData | null {
  const { cols, rows, data } = CAR_SILHOUETTE;
  const src = document.createElement("canvas");
  src.width = cols;
  src.height = rows;
  const sctx = src.getContext("2d");
  if (!sctx) return null;
  sctx.fillStyle = color;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const coverage = parseInt(data[i] || "0", 16) / 15;
      if (coverage <= 0) continue;
      sctx.globalAlpha = coverage;
      sctx.fillRect(x, y, 1, 1);
    }
  }
  sctx.globalAlpha = 1;

  const dst = document.createElement("canvas");
  dst.width = gCols;
  dst.height = gRows;
  const dctx = dst.getContext("2d");
  if (!dctx) return null;
  dctx.drawImage(src, 0, 0, gCols, gRows);
  return dctx.getImageData(0, 0, gCols, gRows);
}

/**
 * An abstract brand emblem (tyre / car / airflow / flag / battery) rendered as a
 * BAYER-DITHERED field (PRD §8) — the same rasterise → grid-sample → ordered-threshold
 * technique as the driver helmets (app/lib/bayer.ts). SVG emblems are rasterised
 * off-screen at a 1 CSS px per cell grid; the car is drawn from its traced coverage
 * bitmap (app/lib/car-silhouette.ts), scaled onto a second offscreen canvas at the
 * target grid so coverage becomes alpha before the Bayer pass. `animate` resolves the
 * field in Bayer order on mount (dither-resolve reveal, used for the small index
 * markers); instant otherwise (used for the large faded watermark behind a concept
 * page). Opacity/size are controlled by the caller's className. Decorative +
 * aria-hidden; the surrounding text carries the meaning.
 */
export function AsciiEmblem({
  kind,
  size = 120,
  cols,
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
  const [cells, setCells] = useState<BayerCell[] | null>(null);
  const [grid, setGridDims] = useState<{ cols: number; rows: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const emblemColor = color ?? CAR_COLOR;

  // 1. Rasterise the emblem off-screen at the sampling grid and Bayer-sample it. `cols`
  //    pins the grid explicitly (e.g. a thin car silhouette needs more columns to read);
  //    otherwise it's derived from `size` at DEFAULT_CELL_PX per cell.
  useEffect(() => {
    let cancelled = false;
    const gCols = Math.round(cols ?? DEFAULT_COLS);

    if (kind === "car") {
      const gRows = Math.max(1, Math.round(gCols * (CAR_SILHOUETTE.rows / CAR_SILHOUETTE.cols)));
      try {
        const imageData = carImageData(gCols, gRows, emblemColor);
        if (!cancelled && imageData) {
          setCells(bayerCells(imageData.data, gCols, gRows));
          setGridDims({ cols: gCols, rows: gRows });
        }
      } catch {
        /* tainted/unsupported canvas → leave the (empty) placeholder */
      }
      return () => {
        cancelled = true;
      };
    }

    const { w, h } = emblemViewBox(kind as SvgEmblem);
    const gRows = Math.max(1, Math.round(gCols * (h / w)));
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(emblemSvgMarkup(kind as SvgEmblem, emblemColor))}`;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const c = document.createElement("canvas");
        c.width = gCols;
        c.height = gRows;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        setCells(bayerCells(data, gCols, gRows));
        setGridDims({ cols: gCols, rows: gRows });
      } catch {
        /* tainted/unsupported canvas → leave the (empty) placeholder */
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [kind, size, emblemColor, cols]);

  // 2. Paint the Bayer field to the visible canvas, optionally with a dither-resolve reveal.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!cells || !grid || !canvas) return;
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

    const paint = (progress: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const cell of cells) {
        if (cell.t > progress) continue;
        ctx.fillStyle = cell.color;
        ctx.fillRect(cell.x * cellPx, cell.y * cellPx, cellPx, cellPx);
      }
    };

    if (reduce || !animate) {
      paint(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / REVEAL_MS);
      paint(easeOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cells, grid, size, animate]);

  if (!cells || !grid) {
    // Reserve the eventual height so the canvas doesn't pop in (square SVG emblems render
    // ~`size` tall; the car keeps the silhouette's aspect).
    const aspect = emblemAspect(kind);
    return <div aria-hidden style={{ width: size, height: size * aspect }} className={className} />;
  }
  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
