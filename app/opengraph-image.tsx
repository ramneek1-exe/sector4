import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { warpedField } from "@/app/lib/noise";

// Link-preview card. Leans into the site aesthetic: flat #FAFAFA, the real brand type
// (Bebas wordmark + PP Mondwest pixel-serif tagline) left-aligned, and a domain-warped
// FBM ASCII fog field on the right — the same look as app/components/AsciiFog. Fonts are
// TTF/OTF (satori can't read woff2); read from disk so they bundle into the route.
export const alt = "Sector 4 — an explainer-led F1 weekend companion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const loadFont = (p: string) => readFileSync(join(process.cwd(), p));

const INK = "#0B1020";
const ACCENT = "#2348E0";

// --- ASCII fog, matched to app/components/AsciiFog + app/lib/ascii-bitmap ---
const COLOR_LO = [11, 30, 107]; // --ramp-0 (deep navy)
const COLOR_HI = [30, 63, 208]; // --ramp-1 (brand blue)
const NOISE_SCALE = 0.09; // same as AsciiFog
const FOG_T = 6.4; // a fog frame with a nicer diagonal billow for the card
const CELL = 22; // px per glyph cell (coarser = more graphic/abstract)
const FOG_COLS = 55; // full-bleed across the 1200px card
const FOG_ROWS = 29;

// Brightness -> character, mirroring ascii-bitmap.ts glyphFor's threshold cascade
// (single-dot · / dot-dot : / plus + / x / hash # / big-dot ●).
function fogChar(v: number): string {
  if (v <= 0.1) return " ";
  if (v <= 0.3) return "·";
  if (v <= 0.4) return ":";
  if (v <= 0.5) return "+";
  if (v <= 0.6) return "x";
  if (v <= 0.8) return "#";
  return "@"; // densest core (● isn't in JetBrains Mono -> satori can't render it)
}

// Sample the field abstractly: let the raw domain-warped FBM through (organic clouds with
// real negative space), pulled DOWN slightly so low areas fall blank, plus one soft,
// localised billow on the right — not a uniform fill.
function fogValue(c: number, r: number): number {
  const v = warpedField(c * NOISE_SCALE, r * NOISE_SCALE, FOG_T) - 0.06;
  const d = Math.hypot(c - FOG_COLS * 0.74, r - FOG_ROWS * 0.42) / (FOG_COLS * 0.32);
  return d < 1 ? v + (1 - d) * (1 - d) * 0.42 : v;
}

function FogCell({ v }: { v: number }) {
  const cv = Math.min(1, v);
  const m = COLOR_LO.map((lo, k) => Math.round(lo + (COLOR_HI[k] - lo) * cv));
  return (
    <div
      style={{
        display: "flex",
        width: CELL,
        height: CELL,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Mono",
        fontSize: 18,
        color: `rgba(${m[0]},${m[1]},${m[2]},${Math.min(1, 0.32 + cv * 0.62)})`,
      }}
    >
      {fogChar(v)}
    </div>
  );
}

export default function OpengraphImage() {
  const bebas = loadFont("app/fonts/og/bebas.ttf");
  const grotesk = loadFont("app/fonts/og/grotesk-bold.ttf");
  const mono = loadFont("app/fonts/og/mono.ttf");
  const mondwest = loadFont("app/fonts/bitmap/PPMondwest-Regular.otf");

  const rows = Array.from({ length: FOG_ROWS }, (_, r) =>
    Array.from({ length: FOG_COLS }, (_, c) => {
      return fogValue(c, r);
    }),
  );

  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", background: "#FAFAFA" }}>
        {/* Full-bleed ASCII fog (same warped FBM, glyph ramp + blue palette as AsciiFog) */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {rows.map((row, r) => (
            <div key={r} style={{ display: "flex", flexDirection: "row" }}>
              {row.map((v, c) => (
                <FogCell key={c} v={v} />
              ))}
            </div>
          ))}
        </div>

        {/* Legibility scrim: white on the left (text crisp), clearing to the right so the
            fog bleeds under the wordmark and fills the right. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            background:
              "linear-gradient(to right, #FAFAFA 0%, rgba(250,250,250,0.92) 26%, rgba(250,250,250,0) 60%)",
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
            maxWidth: 720,
          }}
        >
          <div style={{ display: "flex", fontFamily: "Grotesk", fontSize: 25, fontWeight: 700, letterSpacing: 10, color: ACCENT }}>
            F1 WEEKEND COMPANION
          </div>
          <div style={{ display: "flex", fontFamily: "Bebas", fontSize: 178, letterSpacing: 5, lineHeight: 1, color: INK, marginTop: 12, marginBottom: 26 }}>
            SECTOR4
          </div>
          <div style={{ display: "flex", fontFamily: "Mondwest", fontSize: 44, lineHeight: 1.15, color: "rgba(11,16,32,0.82)", maxWidth: 540 }}>
            Honest podium odds, strategy, and learning.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bebas", data: bebas, style: "normal", weight: 400 },
        { name: "Grotesk", data: grotesk, style: "normal", weight: 700 },
        { name: "Mono", data: mono, style: "normal", weight: 400 },
        { name: "Mondwest", data: mondwest, style: "normal", weight: 400 },
      ],
    },
  );
}
