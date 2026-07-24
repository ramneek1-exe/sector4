"use client";

import { useEffect, useState } from "react";
import { thresholdCells, type BayerCell } from "@/app/lib/bayer";
import { useRevealCanvas } from "@/app/lib/use-reveal-canvas";
import { HELMET_VIEWBOX, SHELL, VENT, VISOR, VISOR_FILL, helmetSvgMarkup } from "@/app/lib/helmet";
import type { ResolvedGlyph } from "@/app/lib/glyph";

// Matches AsciiGlyph / AsciiEmblem: threshold quantization at 2px per cell reads as clean
// 8-bit pixel art without losing shape detail (owner-reviewed 2026-07-22).
const DEFAULT_CELL_PX = 2;

const SHELL_FILL = "#406cd6"; // brand blue (accent-bright)
const VENT_FILL = "#459ae4"; // palette sky

/**
 * The house helmet: the same shared silhouette every driver glyph uses, in brand colours
 * with no number. Not any real driver, and deliberately not derived from drivers.json or
 * teams.json — it is brand furniture, so it must never go stale when the grid changes.
 * Abstract shapes and colour only (PRD §8).
 */
const HOUSE_GLYPH: ResolvedGlyph = {
  code: "S4",
  number: null,
  helmetFill: SHELL_FILL,
  accent: VENT_FILL,
  numberColor: "#ffffff", // unused: `number` is null, so no numeral is ever drawn
  known: false,
};

/**
 * The house helmet rendered as a hard-threshold pixel-art field, resolving in reading order
 * on mount (the shared dither-resolve reveal). Purely presentational and aria-hidden —
 * RadioHelmet owns the button, the label, and all interaction. The plain vector helmet is
 * the server render and the no-canvas fallback, at identical box dimensions so the swap
 * causes no layout shift.
 */
export function HouseHelmet({ size = 220, className = "" }: { size?: number; className?: string }) {
  const [cells, setCells] = useState<BayerCell[] | null>(null);
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null);
  const canvasRef = useRevealCanvas({ cells, grid, size });

  // Rasterise the helmet off-screen at the sampling grid and hard-threshold it.
  useEffect(() => {
    let cancelled = false;
    const { w, h } = HELMET_VIEWBOX;
    const gCols = Math.max(6, Math.round(size / DEFAULT_CELL_PX));
    const gRows = Math.max(1, Math.round(gCols * (h / w)));
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(helmetSvgMarkup(HOUSE_GLYPH, false))}`;

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
        setCells(thresholdCells(data, gCols, gRows));
        setGrid({ cols: gCols, rows: gRows });
      } catch {
        /* tainted/unsupported canvas → keep the vector fallback */
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [size]);

  const height = Math.round((size * HELMET_VIEWBOX.h) / HELMET_VIEWBOX.w);

  // max-w-full matches the guard the canvas gets in globals.css: this vector fallback is
  // what renders server-side and before hydration, so without it a large helmet overflows a
  // narrow viewport for that window. An SVG with width + height + viewBox scales its height
  // from the intrinsic ratio, so no height rule is needed here.
  if (!cells || !grid) {
    return (
      <svg
        width={size}
        height={height}
        viewBox={`0 0 ${HELMET_VIEWBOX.w} ${HELMET_VIEWBOX.h}`}
        aria-hidden
        className={`max-w-full ${className}`}
      >
        <path d={SHELL} fill={SHELL_FILL} />
        <path d={VISOR} fill={VISOR_FILL} />
        <path d={VENT} fill={VENT_FILL} />
      </svg>
    );
  }

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
