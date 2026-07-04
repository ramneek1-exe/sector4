// Compound color-coding for the tyre glyph (PRD §8: color coding + compound letter only,
// NO Pirelli marks). The glyph sits on a dark tyre-black disc (CompoundCard), so these are
// the vivid F1 compound colors (red / yellow / white) that read on black, the way compound
// colors are shown on a tyre. On the near-white page a light HARD washed out; the dark disc
// fixes that without dulling the colors.
export type Compound = "SOFT" | "MEDIUM" | "HARD";

export const COMPOUND_COLOR: Record<Compound, string> = {
  SOFT: "#E8384F", // red
  MEDIUM: "#F2C94C", // yellow
  HARD: "#ECECF2", // white
};

export const COMPOUND_LETTER: Record<Compound, string> = {
  SOFT: "S",
  MEDIUM: "M",
  HARD: "H",
};
