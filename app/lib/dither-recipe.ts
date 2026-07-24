import type { DitheringProps } from "@paper-design/shaders-react";

// The locked lab recipe (docs/superpowers/plans/2026-07-18-dither-shader-swap.md, spec §0).
// This lived as two identical copies in DitherFog and CardFog; DitherShadow would have made
// three. Values are verbatim — do not retune without re-running /lab/dither.

export const WHITE = "#fafafa"; // page surface; multiply-blended layers pass it through
export const BLUE = "#406cd6";
export const SKY = "#459ae4";
export const ACCENT = "#2f2e89";

/** Two white-backed warp layers, multiply-stacked so the palette accumulates over white. */
export const WARP_LAYERS: Partial<DitheringProps>[] = [
  { colorBack: WHITE, colorFront: BLUE, shape: "warp", type: "4x4", size: 2, speed: 0.5, scale: 0.8 },
  { colorBack: WHITE, colorFront: SKY, shape: "warp", type: "4x4", size: 2, speed: 0.35, scale: 0.55 },
];
