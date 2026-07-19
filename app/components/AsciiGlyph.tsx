"use client";

import { useEffect, useRef, useState } from "react";
import { DriverGlyph } from "@/app/components/DriverGlyph";
import { useConceptPopover } from "@/app/components/ConceptPopover";
import { bayerCells, type BayerCell } from "@/app/lib/bayer";
import { resolveGlyph, driverName } from "@/app/lib/glyph";
import { HELMET_VIEWBOX, NUMBER_POS, helmetSvgMarkup } from "@/app/lib/helmet";
import { getEntityWhat, entityKey } from "@/app/lib/entity-whats";

const REVEAL_MS = 450; // dither-resolve reveal duration

function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

/**
 * The driver helmet rendered as a BAYER-DITHERED field (PRD §8). The helmet is
 * rasterised off-screen at a 1 CSS px per cell grid; each pixel is thresholded
 * through the shared ordered-Bayer matrix (app/lib/bayer.ts) so solid interiors
 * fill exactly and antialiased edges dither. The team colour is retained; a crisp
 * numeral is overlaid for legibility. Cells resolve in Bayer order on entry
 * (dither-resolve reveal). The vector glyph is the SSR / no-canvas fallback.
 */
export function AsciiGlyph({
  code,
  team,
  size = 132,
  cols,
}: {
  code: string;
  team: string | null;
  size?: number;
  cols?: number;
}) {
  void cols; // accepted for call-site compat; sampling grid is now derived from `size`
  const [cells, setCells] = useState<BayerCell[] | null>(null);
  const [grid, setGridDims] = useState<{ cols: number; rows: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const g = resolveGlyph(code, team);
  const open = useConceptPopover();
  const what = getEntityWhat("driver", code);
  const name = driverName(code);

  const handleGlyphClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    open(entityKey("driver", code), e.currentTarget.getBoundingClientRect());
  };

  // 1. Rasterise the helmet off-screen at a 1 CSS px per cell grid and Bayer-sample it.
  useEffect(() => {
    let cancelled = false;
    const { w, h } = HELMET_VIEWBOX;
    const gCols = Math.round(size);
    const gRows = Math.round(size * (h / w));
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(helmetSvgMarkup(g, false))}`;

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
        /* tainted/unsupported canvas → keep the vector fallback */
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, team, size]);

  // 2. Paint the Bayer field to the visible canvas, with a dither-resolve reveal.
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

      // Crisp numeral overlay (legible where the dither field can't be), fades in
      // over the final 30% of the reveal.
      if (g.number !== null) {
        ctx.globalAlpha = Math.max(0, Math.min(1, (progress - 0.7) / 0.3));
        ctx.fillStyle = g.numberColor;
        ctx.font = `800 ${Math.round(NUMBER_POS.size * heightPx)}px Arial, Helvetica, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(g.number), NUMBER_POS.x * size, NUMBER_POS.y * heightPx);
        ctx.globalAlpha = 1;
      }
    };

    if (reduce) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, grid, size]);

  // Vector fallback: server render, while sampling, or if canvas is unavailable.
  // Pass click props only when a driver entity-what exists (no dead affordance otherwise).
  if (!cells || !grid) {
    return (
      <DriverGlyph
        code={code}
        team={team}
        size={size}
        onGlyphClick={what ? handleGlyphClick : undefined}
        ariaLabel={what ? `About ${name}` : undefined}
      />
    );
  }

  const canvas = <canvas ref={canvasRef} role="img" aria-label={`${code} helmet`} aria-hidden={!!what} />;
  if (!what) return canvas;
  return (
    <button
      type="button"
      onClick={handleGlyphClick}
      aria-label={`About ${name}`}
      className="cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/60"
    >
      {canvas}
    </button>
  );
}
