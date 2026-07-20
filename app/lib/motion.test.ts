import { describe, expect, it } from "vitest";
import { shouldInitSmoothScroll, tickerTimeToMs } from "./motion";

describe("shouldInitSmoothScroll", () => {
  it("disables smooth scroll under prefers-reduced-motion", () => {
    expect(shouldInitSmoothScroll(true)).toBe(false);
  });
  it("enables smooth scroll otherwise", () => {
    expect(shouldInitSmoothScroll(false)).toBe(true);
  });
});

describe("tickerTimeToMs", () => {
  it("converts gsap ticker seconds to the ms lenis.raf expects", () => {
    expect(tickerTimeToMs(1.5)).toBe(1500);
    expect(tickerTimeToMs(0)).toBe(0);
  });
});
