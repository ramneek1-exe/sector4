"use client";

import { useEffect, useState } from "react";

/**
 * Tracks `prefers-reduced-motion: reduce`, updating if the user changes it mid-session.
 * Extracted verbatim from DitherFog / CardFog / DitherVideo / LandingFooter, which each
 * carried an identical copy.
 * Starts `false` so the server render and the first client render agree; the effect
 * corrects it on mount.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
