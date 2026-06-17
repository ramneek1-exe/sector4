"use client";

import { useEffect, useRef, useState } from "react";
import { DriverGlyph } from "@/app/components/DriverGlyph";
import { asciiRowsFor, sampleAscii, type AsciiGrid } from "@/app/lib/ascii";
import { resolveGlyph } from "@/app/lib/glyph";
import { HELMET_VIEWBOX, helmetSvgMarkup } from "@/app/lib/helmet";

// Per-cell supersample for the off-screen rasterise — enough pixels per ASCII
// cell to average cleanly without rendering a full-size bitmap.
const SS = 6;

/**
 * The driver helmet rendered AS COLOURED ASCII (PRD §8). The plain vector glyph
 * is shown first (and as the no-canvas / SSR fallback); a useEffect rasterises
 * the same helmet off-screen, samples it (app/lib/ascii.ts), and swaps in a grid
 * of monospace characters that keep the team colour. Characters materialise with
 * a scattered blur-in — gated behind prefers-reduced-motion.
 */
export function AsciiGlyph({
  code,
  team,
  size = 92,
  cols = 30,
}: {
  code: string;
  team: string | null;
  size?: number;
  cols?: number;
}) {
  const [grid, setGrid] = useState<AsciiGrid | null>(null);
  const reduceRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    reduceRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const g = resolveGlyph(code, team);
    const { w, h } = HELMET_VIEWBOX;
    const rows = asciiRowsFor(w, h, cols);
    const svg = helmetSvgMarkup(g);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = cols * SS;
        canvas.height = rows * SS;
        const ctx = canvas.getContext("2d");
        if (!ctx) return; // keep the vector fallback
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setGrid(sampleAscii(data, canvas.width, canvas.height, cols, { rows }));
      } catch {
        /* tainted/unsupported canvas → keep the vector fallback */
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [code, team, cols]);

  // Vector fallback: server render, while sampling, or if canvas is unavailable.
  if (!grid) return <DriverGlyph code={code} team={team} size={size} />;

  const cellW = size / grid.cols;
  const rowH = cellW / 0.55; // monospace cell aspect → preserves helmet proportions
  const reduce = reduceRef.current;

  return (
    <div
      role="img"
      aria-label={`${code} helmet`}
      className="font-mono select-none"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${grid.cols}, ${cellW}px)`,
        gridAutoRows: `${rowH}px`,
        width: size,
        lineHeight: `${rowH}px`,
        fontSize: rowH * 0.96,
      }}
    >
      {grid.cells.map((cell, i) =>
        cell.ch ? (
          <span
            key={i}
            aria-hidden
            className={reduce ? undefined : "ascii-cell"}
            style={{
              color: cell.color ?? undefined,
              textAlign: "center",
              // Scattered, not a left-to-right sweep (Jhey): hashed per-cell delay.
              animationDelay: reduce ? undefined : `${((i * 53) % 19) * 18}ms`,
            }}
          >
            {cell.ch}
          </span>
        ) : (
          <span key={i} aria-hidden />
        ),
      )}
    </div>
  );
}
