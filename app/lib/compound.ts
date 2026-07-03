// Compound color-coding for the tyre glyph (PRD §8: color coding + compound letter only,
// NO Pirelli marks). HARD uses a light grey, not white, so it reads on the near-white bg.
export type Compound = "SOFT" | "MEDIUM" | "HARD";

export const COMPOUND_COLOR: Record<Compound, string> = {
  SOFT: "#DA2A47", // red
  MEDIUM: "#E6A93A", // amber
  HARD: "#B9BAC6", // light grey
};

export const COMPOUND_LETTER: Record<Compound, string> = {
  SOFT: "S",
  MEDIUM: "M",
  HARD: "H",
};
