import { describe, it, expect } from "vitest";
import { shouldPaint } from "./frame-throttle";

describe("shouldPaint", () => {
  it("returns false when less time than minIntervalMs has elapsed", () => {
    expect(shouldPaint(1010, 1000, 33.33)).toBe(false);
  });

  it("returns true when exactly minIntervalMs has elapsed", () => {
    expect(shouldPaint(1030, 1000, 30)).toBe(true);
  });

  it("returns true when more than minIntervalMs has elapsed", () => {
    expect(shouldPaint(1100, 1000, 33.33)).toBe(true);
  });

  it("returns true on the first call once real elapsed time exceeds the interval (lastPaint = 0, now = a realistic rAF timestamp)", () => {
    expect(shouldPaint(5000, 0, 33.33)).toBe(true);
  });

  it("is a pure function: same inputs always produce the same output", () => {
    const a = shouldPaint(2000, 1900, 33.33);
    const b = shouldPaint(2000, 1900, 33.33);
    expect(a).toBe(b);
  });
});
