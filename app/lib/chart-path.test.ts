import { describe, it, expect } from "vitest";
import { buildLinePath } from "./chart-path";

const noPad = { top: 0, right: 0, bottom: 0, left: 0 };

describe("buildLinePath", () => {
  it("spreads points across the inner width and inverts the y axis", () => {
    const pts = buildLinePath([0, 0.5, 1], 100, 100, noPad);
    const coords = pts.split(" ").map((p) => p.split(",").map(Number));
    expect(coords[0][0]).toBe(0); // first x at left
    expect(coords[2][0]).toBe(100); // last x at right
    expect(coords[0][1]).toBe(100); // value 0 -> bottom (y = H)
    expect(coords[2][1]).toBe(0); // value 1 -> top (y = 0)
    expect(coords[1][1]).toBe(50); // value 0.5 -> middle
  });

  it("clamps out-of-range values into the box", () => {
    const pts = buildLinePath([-1, 2], 100, 100, noPad);
    const ys = pts.split(" ").map((p) => Number(p.split(",")[1]));
    expect(ys[0]).toBe(100); // -1 clamps to 0 -> bottom
    expect(ys[1]).toBe(0); // 2 clamps to 1 -> top
  });
});
