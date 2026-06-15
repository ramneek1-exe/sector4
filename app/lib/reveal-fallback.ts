export type RevealEnv = { prefersReducedMotion: boolean; hasWebGPU: boolean };

/** Use the plain fade fallback when motion is reduced OR WebGPU is unavailable. */
export function shouldUseFallback({ prefersReducedMotion, hasWebGPU }: RevealEnv): boolean {
  return prefersReducedMotion || !hasWebGPU;
}

/** Read the current environment in the browser (guarded for SSR). */
export function readRevealEnv(): RevealEnv {
  if (typeof window === "undefined") return { prefersReducedMotion: true, hasWebGPU: false };
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasWebGPU = typeof (navigator as any).gpu !== "undefined";
  return { prefersReducedMotion, hasWebGPU };
}
