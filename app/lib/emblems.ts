// Abstract ASCII/dither emblems for the learning layer — one per concept group. PRD §8:
// generic shapes only, no logos/marks/liveries. Rendered as a brand-blue dither field by
// AsciiEmblem. The tyre + airflow are simple SVGs (below); the CAR is a traced silhouette
// bitmap (app/lib/car-silhouette.ts) so it reads as an unmistakable F1 car at any size.

export type EmblemKind = "tyre" | "car" | "airflow" | "flag" | "battery";
// The two emblems drawn from inline SVG (the car comes from the silhouette bitmap instead).
export type SvgEmblem = "tyre" | "airflow" | "flag" | "battery";

const VIEWBOX: Record<SvgEmblem, { w: number; h: number }> = {
  tyre: { w: 120, h: 120 },
  airflow: { w: 120, h: 120 },
  flag: { w: 120, h: 120 },
  battery: { w: 120, h: 120 },
};

export function emblemViewBox(kind: SvgEmblem): { w: number; h: number } {
  return VIEWBOX[kind];
}

/** Map a concept group to its emblem. */
export function emblemForGroup(group: string): EmblemKind {
  if (group.startsWith("Tyres")) return "tyre";
  if (group.startsWith("Pace")) return "car";
  if (group.startsWith("Race")) return "flag"; // Race control (chequered flag, a
    // nation-agnostic race symbol, not a national flag, so it is fine under PRD §8)
  if (group.startsWith("Power")) return "battery"; // Power & energy
  return "airflow"; // Air & aero
}

// Shapes draw only the figure (transparent elsewhere) so the dither sampler reads a glyph,
// not a filled box. `fill="none"` rings/strokes keep genuine holes (e.g. the tyre centre).
const shapes = (c: string): Record<SvgEmblem, string> => ({
  // Side-on tyre: a thick tread ring (transparent centre) + a hub.
  tyre: `
    <circle cx="60" cy="60" r="40" fill="none" stroke="${c}" stroke-width="22"/>
    <circle cx="60" cy="60" r="9" fill="${c}"/>
  `,
  // Wind: three streamlines, each curling into a loop (the classic gust icon).
  airflow: `
    <path d="M14,42 H56 a13,13 0 1 0 -9,-13" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round"/>
    <path d="M14,64 H90 a17,17 0 1 0 -13,-17" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round"/>
    <path d="M14,90 H58 a13,13 0 1 1 -9,13" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round"/>
  `,
  // Chequered flag on a pole. Single color, so the checker is alternating filled/empty
  // squares (the empty squares are the transparent background) plus the pole.
  flag: `
    <rect x="26" y="16" width="6" height="88" fill="${c}"/>
    <rect x="36" y="24" width="18" height="18" fill="${c}"/>
    <rect x="72" y="24" width="18" height="18" fill="${c}"/>
    <rect x="54" y="42" width="18" height="18" fill="${c}"/>
    <rect x="90" y="42" width="18" height="18" fill="${c}"/>
    <rect x="36" y="60" width="18" height="18" fill="${c}"/>
    <rect x="72" y="60" width="18" height="18" fill="${c}"/>
  `,
  // Abstract battery: cell outline + terminal nub + three charge bars.
  battery: `
    <rect x="22" y="42" width="68" height="36" rx="6" fill="none" stroke="${c}" stroke-width="7"/>
    <rect x="92" y="52" width="8" height="16" fill="${c}"/>
    <rect x="36" y="52" width="9" height="16" fill="${c}"/>
    <rect x="50" y="52" width="9" height="16" fill="${c}"/>
    <rect x="64" y="52" width="9" height="16" fill="${c}"/>
  `,
});

export function emblemSvgMarkup(kind: SvgEmblem, color = "#406CD6"): string {
  const { w, h } = VIEWBOX[kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${shapes(color)[kind]}</svg>`;
}
