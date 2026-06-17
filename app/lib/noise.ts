// Lightweight value-noise + FBM with domain warping — the organic, non-repeating
// motion behind the ASCII fog. Mirrors the approach in the reactbits "Dither"
// background (4-octave FBM + domain warp) but in plain JS so the fog can run on a
// 2D canvas without WebGL. Deterministic (hash-based), no allocations in the hot path.

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in [0,1] over a smooth lattice. */
export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const tl = hash(xi, yi);
  const tr = hash(xi + 1, yi);
  const bl = hash(xi, yi + 1);
  const br = hash(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  const top = tl + (tr - tl) * u;
  const bottom = bl + (br - bl) * u;
  return top + (bottom - top) * v;
}

/** Fractal brownian motion — summed octaves of value noise, normalised to [0,1]. */
export function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Domain-warped FBM at time `t`. The warp offsets the sample point by another FBM,
 * which is what makes the field churn and fold organically instead of scrolling or
 * rotating as a fixed pattern. Returns [0,1].
 */
export function warpedField(x: number, y: number, t: number): number {
  const qx = fbm(x + 0.0, y + t * 0.12);
  const qy = fbm(x + 5.2, y - t * 0.12);
  return fbm(x + 4 * qx, y + 4 * qy + t * 0.06);
}
