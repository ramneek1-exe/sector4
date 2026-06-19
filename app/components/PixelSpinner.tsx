"use client";

import { useEffect, useState } from "react";

// Rotating line — a spinning line in the mono face.
const FRAMES = ["│", "╱", "─", "╲"];

/** Cycling pixel spinner. Fixed-width (one glyph). Static first frame under reduced motion. */
export function PixelSpinner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 110);
    return () => clearInterval(id);
  }, []);
  return (
    <span aria-hidden className="inline-block w-[1ch] text-center font-mono">
      {FRAMES[i]}
    </span>
  );
}
