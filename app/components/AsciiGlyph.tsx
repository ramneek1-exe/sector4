"use client";

import { useEffect, useRef, useState } from "react";
import { DriverGlyph } from "@/app/components/DriverGlyph";
import { useConceptPopover } from "@/app/components/ConceptPopover";
import { asciiRowsFor, sampleAscii, type AsciiGrid } from "@/app/lib/ascii";
import { resolveGlyph, driverName } from "@/app/lib/glyph";
import { HELMET_VIEWBOX, NUMBER_POS, helmetSvgMarkup } from "@/app/lib/helmet";
import { scatterDelay } from "@/app/lib/scatter";
import { getEntityWhat, entityKey } from "@/app/lib/entity-whats";

const SS = 5; // off-screen supersample per ASCII cell
const REVEAL_MS = 520; // window over which cells scatter in
const FADE_MS = 320; // per-cell develop duration

function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

/**
 * The driver helmet rendered as a COLOURED ASCII / dither field (PRD §8). The helmet
 * is rasterised + sampled off-screen (app/lib/ascii.ts); each cell is drawn as a
 * square whose size scales with coverage — solid where the helmet is filled, finer
 * "particles" at the edges (no lattice gaps). The team colour is retained; a crisp
 * numeral is overlaid for legibility. Cells develop in with a scattered dither-resolve.
 * The vector glyph is the SSR / no-canvas fallback.
 */
export function AsciiGlyph({
  code,
  team,
  size = 132,
  cols = 32,
}: {
  code: string;
  team: string | null;
  size?: number;
  cols?: number;
}) {
  const [grid, setGrid] = useState<AsciiGrid | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const g = resolveGlyph(code, team);
  const open = useConceptPopover();
  const what = getEntityWhat("driver", code);
  const name = driverName(code);

  const handleGlyphClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    open(entityKey("driver", code), e.currentTarget.getBoundingClientRect());
  };

  // 1. Rasterise + sample the helmet off-screen.
  useEffect(() => {
    let cancelled = false;
    const { w, h } = HELMET_VIEWBOX;
    const rows = asciiRowsFor(w, h, cols, 1); // square cells
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
        setGrid(sampleAscii(data, c.width, c.height, cols, { rows, threshold: 0.12 }));
      } catch {
        /* tainted/unsupported canvas → keep the vector fallback */
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, team, cols]);

  // 2. Draw the dither field to the visible canvas, with a scattered develop reveal.
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

    // Per-cell scatter offset for the dissolve (deterministic, no hydration risk).
    const delayFor = (i: number) => scatterDelay(i, REVEAL_MS);
    // Coverage → square fill ratio. Biased dense so the helmet reads solid, with
    // smaller particles only at the soft edges.
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

      // Crisp numeral overlay (legible where the ASCII can't be), fades in last.
      if (g.number !== null) {
        const last = Math.min(1, progress(grid.cells.length - 1) + 0.2);
        ctx.globalAlpha = Math.max(0, (last - 0.5) * 2);
        ctx.fillStyle = g.numberColor;
        ctx.font = `800 ${Math.round(NUMBER_POS.size * heightPx)}px Arial, Helvetica, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(g.number), NUMBER_POS.x * size, NUMBER_POS.y * heightPx);
        ctx.globalAlpha = 1;
      }
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
      if (t < REVEAL_MS + FADE_MS + 120) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, size]);

  // Vector fallback: server render, while sampling, or if canvas is unavailable.
  // Pass click props only when a driver entity-what exists (no dead affordance otherwise).
  if (!grid) {
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

  const canvas = <canvas ref={canvasRef} role="img" aria-label={`${code} helmet`} />;
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
