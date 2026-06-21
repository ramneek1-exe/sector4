// ASCII glyphs as 5x5 bitmaps, ported from the 1NCOGNIT0 Spark AR ASCII shader
// (etlaM21/1NCOGNIT0, ASCII/SparkAR_ASCII/shaders/asciiShader.sca). That shader is
// font-free: it pixelates the input, then per cell picks a 5x5 dot-matrix character
// by brightness and tints the lit sub-cells with the source colour. We reproduce the
// exact glyph set + brightness ramp on canvas so it runs everywhere (no WebGPU/WebGL)
// and drives BOTH the ambient fog and the colour-retaining driver helmets.

export const GLYPH_DIM = 5;

// Row-major 5x5, 1 = lit. Names + bit patterns match the shader's int[25] arrays.
const SINGLE_DOT = [0,0,0,0,0, 0,0,0,0,0, 0,0,1,0,0, 0,0,0,0,0, 0,0,0,0,0];
const DOT_DOT    = [0,0,0,0,0, 0,0,1,0,0, 0,0,0,0,0, 0,0,1,0,0, 0,0,0,0,0];
const PLUS       = [0,0,0,0,0, 0,0,1,0,0, 0,1,1,1,0, 0,0,1,0,0, 0,0,0,0,0];
const X_SIGN     = [1,0,0,0,1, 0,1,0,1,0, 0,0,1,0,0, 0,1,0,1,0, 1,0,0,0,1];
const HASHTAG    = [0,1,0,1,0, 1,1,1,1,1, 0,1,0,1,0, 1,1,1,1,1, 0,1,0,1,0];
const BIG_DOT    = [0,0,1,0,0, 0,1,1,1,0, 1,1,1,1,1, 0,1,1,1,0, 0,0,1,0,0];

// Ascending brightness → denser glyph. Mirrors the shader's threshold cascade.
const RAMP: { min: number; bits: number[] }[] = [
  { min: 0.1, bits: SINGLE_DOT },
  { min: 0.3, bits: DOT_DOT },
  { min: 0.4, bits: PLUS },
  { min: 0.5, bits: X_SIGN },
  { min: 0.6, bits: HASHTAG },
  { min: 0.8, bits: BIG_DOT },
];

/** Pick the 5x5 bitmap for a brightness in [0,1]; null below the first threshold. */
export function glyphFor(brightness: number): number[] | null {
  let bits: number[] | null = null;
  for (const step of RAMP) {
    if (brightness > step.min) bits = step.bits;
  }
  return bits;
}
