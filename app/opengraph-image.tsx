import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { warpedField } from "@/app/lib/noise";

// Link-preview card. Leans into the site aesthetic: flat #FAFAFA, the real brand type
// (Bebas wordmark + PP Mondwest pixel-serif tagline) left-aligned, and a domain-warped
// FBM dot-matrix halftone field on the right — real dither dots (sized/opacity by
// sampled value), not ASCII characters, matching the LED-halftone technique used
// elsewhere (e.g. the start-lights lamps) more closely than a character-glyph fog
// would. Fonts are TTF/OTF (satori can't read woff2); read from disk so they bundle
// into the route. Owner-picked from 4 rendered candidates (2026-07-26): dark vs. light
// background, ASCII-char vs. dot-matrix fog — this is light bg + dot-matrix.
export const alt = "Sector 4: an explainer-led F1 weekend companion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const loadFont = (p: string) => readFileSync(join(process.cwd(), p));

const INK = "#0B1020";
const ACCENT = "#2348E0";
const BG = "#FAFAFA";

// --- dot-matrix halftone, matched to the warped FBM field used across the site ---
const NOISE_SCALE = 0.09;
const FOG_T = 6.4; // a fog frame with a nicer diagonal billow for the card
const CELL = 14; // px per dot cell
const FOG_COLS = Math.ceil(1200 / CELL);
const FOG_ROWS = Math.ceil(630 / CELL);
const DOT_MAX = 9; // max dot diameter in px, at the fullest sampled value

// Sample the field abstractly: let the raw domain-warped FBM through (organic clouds with
// real negative space), pulled DOWN slightly so low areas fall blank, plus one soft,
// localised billow on the right — not a uniform fill.
function fogValue(c: number, r: number): number {
  const v = warpedField(c * NOISE_SCALE, r * NOISE_SCALE, FOG_T) - 0.06;
  const d = Math.hypot(c - FOG_COLS * 0.74, r - FOG_ROWS * 0.42) / (FOG_COLS * 0.32);
  return d < 1 ? v + (1 - d) * (1 - d) * 0.42 : v;
}

function DotCell({ v }: { v: number }) {
  const cv = Math.max(0, Math.min(1, v));
  const d = Math.round(cv * DOT_MAX);
  return (
    <div style={{ display: "flex", width: CELL, height: CELL, alignItems: "center", justifyContent: "center" }}>
      {d > 0 && (
        <div
          style={{
            display: "flex",
            width: d,
            height: d,
            borderRadius: 999,
            background: ACCENT,
            opacity: Math.min(1, 0.3 + cv * 0.6),
          }}
        />
      )}
    </div>
  );
}

export default function OpengraphImage() {
  const bebas = loadFont("app/fonts/og/bebas.ttf");
  const grotesk = loadFont("app/fonts/og/grotesk-bold.ttf");
  const mondwest = loadFont("app/fonts/bitmap/PPMondwest-Regular.otf");

  const rows = Array.from({ length: FOG_ROWS }, (_, r) =>
    Array.from({ length: FOG_COLS }, (_, c) => fogValue(c, r)),
  );

  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", background: BG }}>
        {/* Full-bleed dot-matrix halftone (same warped FBM + blue palette as the site's dither look) */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {rows.map((row, r) => (
            <div key={r} style={{ display: "flex", flexDirection: "row" }}>
              {row.map((v, c) => (
                <DotCell key={c} v={v} />
              ))}
            </div>
          ))}
        </div>

        {/* Legibility scrim: solid on the left (text crisp), clearing to the right so the
            dot field bleeds under the wordmark and fills the right. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            background: `linear-gradient(to right, ${BG} 0%, rgba(250,250,250,0.92) 26%, rgba(250,250,250,0) 60%)`,
          }}
        />

        {/* Text, left-aligned, over the scrim */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-start",
            paddingLeft: 80,
            paddingRight: 24,
            maxWidth: 800,
          }}
        >
          <div style={{ display: "flex", fontFamily: "Grotesk", fontSize: 24, fontWeight: 700, letterSpacing: 6, color: ACCENT }}>
            F1, MINUS THE FALSE CONFIDENCE
          </div>
          <div style={{ display: "flex", fontFamily: "Bebas", fontSize: 168, letterSpacing: 5, lineHeight: 1, color: INK, marginTop: 14, marginBottom: 26 }}>
            SECTOR4
          </div>
          <div style={{ display: "flex", fontFamily: "Mondwest", fontSize: 38, lineHeight: 1.25, color: "rgba(11,16,32,0.82)", maxWidth: 600 }}>
            Honest podium odds and a scored track record, not a confident guess.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bebas", data: bebas, style: "normal", weight: 400 },
        { name: "Grotesk", data: grotesk, style: "normal", weight: 700 },
        { name: "Mondwest", data: mondwest, style: "normal", weight: 400 },
      ],
    },
  );
}
