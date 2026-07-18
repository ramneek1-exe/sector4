import { describe, it, expect } from "vitest";
import { buildLinePath, pointCoords, yLevel, plotPoints, labelStride } from "./chart-path";

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

const PAD = { top: 16, right: 44, bottom: 30, left: 34 };
const W = 640, H = 240;

describe("pointCoords", () => {
  it("returns one coord per value, y inverted (1 = top)", () => {
    const pts = pointCoords([1, 0], W, H, PAD);
    expect(pts).toHaveLength(2);
    expect(pts[0].y).toBeCloseTo(PAD.top);                 // value 1 -> top
    expect(pts[1].y).toBeCloseTo(H - PAD.bottom);          // value 0 -> baseline
    expect(pts[0].x).toBeCloseTo(PAD.left);                // first point at left
    expect(pts[1].x).toBeCloseTo(W - PAD.right);           // last point at right
  });

  it("buildLinePath is pointCoords joined as an SVG points string", () => {
    const pts = pointCoords([0.5, 0.8], W, H, PAD);
    expect(buildLinePath([0.5, 0.8], W, H, PAD)).toBe(pts.map((p) => `${p.x},${p.y}`).join(" "));
  });
});

describe("yLevel", () => {
  it("maps 0 to baseline, 1 to top, 0.5 to the middle of the plot box", () => {
    expect(yLevel(0, H, PAD)).toBeCloseTo(H - PAD.bottom);
    expect(yLevel(1, H, PAD)).toBeCloseTo(PAD.top);
    expect(yLevel(0.5, H, PAD)).toBeCloseTo(PAD.top + (H - PAD.top - PAD.bottom) / 2);
  });
});

describe("plotPoints (shared timeline)", () => {
  const PAD = { top: 16, right: 44, bottom: 30, left: 34 };
  const W = 640, H = 240;

  it("maps pos 0 to the left edge, pos total-1 to the right edge, y from value", () => {
    const pts = plotPoints([1, 0.5], [0, 4], 5, W, H, PAD); // total 5
    expect(pts[0].x).toBeCloseTo(PAD.left);              // pos 0
    expect(pts[0].y).toBeCloseTo(PAD.top);               // value 1 -> top
    expect(pts[1].x).toBeCloseTo(W - PAD.right);         // pos 4 = total-1
  });

  it("places a middle position proportionally", () => {
    const innerW = W - PAD.left - PAD.right;
    const pts = plotPoints([0.5], [2], 5, W, H, PAD);    // pos 2 of 0..4 -> halfway
    expect(pts[0].x).toBeCloseTo(PAD.left + innerW * (2 / 4));
  });

  it("centers a single-round timeline (total <= 1)", () => {
    const innerW = W - PAD.left - PAD.right;
    const pts = plotPoints([0.7], [0], 1, W, H, PAD);
    expect(pts[0].x).toBeCloseTo(PAD.left + innerW / 2);
  });
});

describe("labelStride", () => {
  it("is 1 while total fits under max", () => {
    expect(labelStride(9)).toBe(1);
    expect(labelStride(12)).toBe(1);
    expect(labelStride(1)).toBe(1);
  });
  it("grows so labels stay under max", () => {
    expect(labelStride(24)).toBe(2);
    expect(labelStride(25)).toBe(3);
  });
});
