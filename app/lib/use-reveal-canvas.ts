"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { BayerCell } from "@/app/lib/bayer";

export const REVEAL_MS = 450; // dither-resolve reveal duration

function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

/** Painted on top of the resolved cell field each frame. `progress` is the eased reveal
 *  fraction (0..1); `dims` are the canvas's CSS pixel dimensions. AsciiGlyph uses this for
 *  the crisp numeral; the emblem and house helmet pass nothing. */
export type OverlayDraw = (
  ctx: CanvasRenderingContext2D,
  progress: number,
  dims: { width: number; height: number }
) => void;

/**
 * Paints a hard-thresholded cell field (app/lib/bayer.ts) to a canvas with the shared
 * dither-resolve reveal: cells appear in reading order over REVEAL_MS, eased. Handles DPR
 * sizing and the reduced-motion instant paint.
 *
 * Extracted from AsciiGlyph and AsciiEmblem, which carried identical copies of this loop.
 * Behaviour is unchanged from those originals: same REVEAL_MS, same easing curve, same
 * `min(2, devicePixelRatio)` clamp, same reduced-motion branch.
 */
export function useRevealCanvas({
  cells,
  grid,
  size,
  animate = true,
  drawOverlay,
}: {
  cells: BayerCell[] | null;
  grid: { cols: number; rows: number } | null;
  size: number;
  animate?: boolean;
  drawOverlay?: OverlayDraw;
}): RefObject<HTMLCanvasElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The overlay closure is rebuilt every render by its caller, so it must not be an effect
  // dependency or the reveal would restart on each render. Hold it in a ref instead.
  const overlayRef = useRef<OverlayDraw | undefined>(drawOverlay);
  overlayRef.current = drawOverlay;

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
      overlayRef.current?.(ctx, progress, { width: size, height: heightPx });
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

  return canvasRef;
}
