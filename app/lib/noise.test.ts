import { describe, expect, it } from "vitest";
import { fbm, valueNoise, warpedField } from "@/app/lib/noise";

describe("noise", () => {
  it("valueNoise stays in [0,1] and is deterministic", () => {
    for (let i = 0; i < 50; i++) {
      const v = valueNoise(i * 0.37, i * 1.13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(valueNoise(1.5, 2.5)).toBe(valueNoise(1.5, 2.5));
  });

  it("fbm stays in [0,1]", () => {
    for (let i = 0; i < 50; i++) {
      const v = fbm(i * 0.7, i * 0.3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("warpedField evolves over time (not a static field)", () => {
    const a = warpedField(3, 4, 0);
    const b = warpedField(3, 4, 10);
    expect(a).not.toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });
});
