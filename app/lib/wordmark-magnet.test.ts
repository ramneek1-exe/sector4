import { describe, it, expect } from "vitest";
import { magnetOffset, lerp } from "./wordmark-magnet";

describe("magnetOffset", () => {
  it("is zero when the pointer is exactly at the letter center", () => {
    expect(
      magnetOffset({ x: 100, y: 100 }, { x: 100, y: 100 }, { radius: 80, maxOffset: 10 }),
    ).toEqual({ x: 0, y: 0 });
  });

  it("is zero at or beyond the radius", () => {
    expect(
      magnetOffset({ x: 0, y: 0 }, { x: 80, y: 0 }, { radius: 80, maxOffset: 10 }),
    ).toEqual({ x: 0, y: 0 });
    expect(
      magnetOffset({ x: 0, y: 0 }, { x: 200, y: 0 }, { radius: 80, maxOffset: 10 }),
    ).toEqual({ x: 0, y: 0 });
  });

  it("offset direction points from the letter toward the pointer", () => {
    const right = magnetOffset({ x: 0, y: 0 }, { x: 40, y: 0 }, { radius: 80, maxOffset: 10 });
    expect(right.x).toBeGreaterThan(0);
    expect(right.y).toBe(0);
    const left = magnetOffset({ x: 0, y: 0 }, { x: -40, y: 0 }, { radius: 80, maxOffset: 10 });
    expect(left.x).toBeLessThan(0);
  });

  it("magnitude scales linearly with falloff (midpoint radius = half maxOffset)", () => {
    const o = magnetOffset({ x: 0, y: 0 }, { x: 40, y: 0 }, { radius: 80, maxOffset: 10 });
    // dist=40, falloff=1-40/80=0.5, magnitude=10*0.5=5
    expect(o.x).toBeCloseTo(5, 5);
    expect(o.y).toBe(0);
  });

  it("magnitude approaches maxOffset as distance approaches 0", () => {
    const o = magnetOffset({ x: 0, y: 0 }, { x: 1, y: 0 }, { radius: 80, maxOffset: 10 });
    // dist=1, falloff=1-1/80=0.9875, magnitude=9.875
    expect(o.x).toBeCloseTo(9.875, 2);
  });
});

describe("lerp", () => {
  it("returns current when factor is 0", () => {
    expect(lerp(0, 100, 0)).toBe(0);
  });
  it("returns target when factor is 1", () => {
    expect(lerp(0, 100, 1)).toBe(100);
  });
  it("moves partway toward target for a fractional factor", () => {
    expect(lerp(0, 100, 0.12)).toBeCloseTo(12, 5);
  });
  it("converges: repeated application approaches target", () => {
    let v = 0;
    for (let i = 0; i < 50; i++) v = lerp(v, 100, 0.12);
    expect(v).toBeCloseTo(100, 0);
  });
});
