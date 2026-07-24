"use client";

import { useEffect, useState } from "react";
import { DriverGlyph } from "@/app/components/DriverGlyph";
import { useConceptPopover } from "@/app/components/ConceptPopover";
import { thresholdCells, type BayerCell } from "@/app/lib/bayer";
import { resolveGlyph, driverName } from "@/app/lib/glyph";
import { HELMET_VIEWBOX, NUMBER_POS, helmetSvgMarkup } from "@/app/lib/helmet";
import { getEntityWhat, entityKey } from "@/app/lib/entity-whats";
import { useRevealCanvas } from "@/app/lib/use-reveal-canvas";

// Target CSS px per grid cell when the caller doesn't pin `cols` -- see AsciiEmblem's
// DEFAULT_CELL_PX for the owner-reviewed rationale (threshold quantization at 2px/cell,
// no ordered-dither scatter).
const DEFAULT_CELL_PX = 2;

/**
 * The driver helmet rendered as a hard-threshold pixel-art field (PRD §8). The helmet is
 * rasterised off-screen at the sampling grid; each cell is a majority-coverage alpha
 * threshold (app/lib/bayer.ts) so solid interiors fill exactly and edges quantize to a
 * clean staircase, not a dither scatter. The team colour is retained; a crisp numeral is
 * overlaid for legibility. Cells resolve in reading order on entry (dither-resolve
 * reveal). The vector glyph is the SSR / no-canvas fallback.
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
  const [cells, setCells] = useState<BayerCell[] | null>(null);
  const [grid, setGridDims] = useState<{ cols: number; rows: number } | null>(null);
  const g = resolveGlyph(code, team);
  const open = useConceptPopover();
  const what = getEntityWhat("driver", code);
  const name = driverName(code);

  const handleGlyphClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    open(entityKey("driver", code), e.currentTarget.getBoundingClientRect());
  };

  // 1. Rasterise the helmet off-screen at the sampling grid and hard-threshold it. `cols`
  //    pins the grid explicitly; otherwise it's derived from `size` at DEFAULT_CELL_PX.
  useEffect(() => {
    let cancelled = false;
    const { w, h } = HELMET_VIEWBOX;
    const gCols = Math.max(6, Math.round(cols ?? size / DEFAULT_CELL_PX));
    const gRows = Math.max(1, Math.round(gCols * (h / w)));
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
        setCells(thresholdCells(data, gCols, gRows));
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
  }, [code, team, size, cols]);

  const canvasRef = useRevealCanvas({
    cells,
    grid,
    size,
    // Crisp numeral overlay (legible where the dither field can't be), fades in over the
    // final 30% of the reveal.
    drawOverlay:
      g.number === null
        ? undefined
        : (ctx, progress, dims) => {
            ctx.globalAlpha = Math.max(0, Math.min(1, (progress - 0.7) / 0.3));
            ctx.fillStyle = g.numberColor;
            ctx.font = `800 ${Math.round(NUMBER_POS.size * dims.height)}px Arial, Helvetica, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(g.number), NUMBER_POS.x * dims.width, NUMBER_POS.y * dims.height);
            ctx.globalAlpha = 1;
          },
  });

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
