// Pure decision helpers for the site-wide smooth-scroll setup. Kept out of the client
// components so the reduced-motion gate and the gsap-ticker unit conversion (seconds ->
// the milliseconds lenis.raf expects) are unit-testable.
export function shouldInitSmoothScroll(prefersReducedMotion: boolean): boolean {
  return !prefersReducedMotion;
}

export function tickerTimeToMs(timeSeconds: number): number {
  return timeSeconds * 1000;
}
