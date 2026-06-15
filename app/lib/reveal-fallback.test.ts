import { describe, it, expect } from "vitest";
import { shouldUseFallback } from "./reveal-fallback";

describe("shouldUseFallback", () => {
  it("falls back when prefers-reduced-motion matches", () => {
    expect(shouldUseFallback({ prefersReducedMotion: true, hasWebGPU: true })).toBe(true);
  });
  it("falls back when WebGPU is unavailable", () => {
    expect(shouldUseFallback({ prefersReducedMotion: false, hasWebGPU: false })).toBe(true);
  });
  it("uses the shader when motion is allowed and WebGPU is present", () => {
    expect(shouldUseFallback({ prefersReducedMotion: false, hasWebGPU: true })).toBe(false);
  });
});
