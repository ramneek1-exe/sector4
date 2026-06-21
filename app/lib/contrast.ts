// WCAG contrast guard for glyph numerals (PRD §8). Keeps the driver's personal
// color when it reads on the team-color helmet; otherwise falls back to the better
// of ink / white. Ink is the brand near-black (never pure #000000).
export const INK = "#0B1020";
export const WHITE = "#FFFFFF";

// Minimum contrast ratio for the large glyph numeral (WCAG "large text" floor is 3.0).
const MIN_RATIO = 3.0;

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Return `fg` if it reads on `bg`, else the better-contrasting of ink/white. */
export function contrastGuard(fg: string, bg: string): string {
  if (ratio(fg, bg) >= MIN_RATIO) return fg;
  return ratio(INK, bg) >= ratio(WHITE, bg) ? INK : WHITE;
}
