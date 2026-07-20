import { describe, expect, it } from "vitest";
import { buildTrackGeometry } from "./track-path";

const ZIGZAG = [
  { x: 600, y: 200 },
  { x: 100, y: 800 },
  { x: 600, y: 1400 },
  { x: 100, y: 2000 },
];

describe("buildTrackGeometry", () => {
  it("returns null for fewer than 2 anchors", () => {
    expect(buildTrackGeometry([])).toBeNull();
    expect(buildTrackGeometry([{ x: 1, y: 2 }])).toBeNull();
  });

  it("builds straights at each anchor and connectors between them", () => {
    const g = buildTrackGeometry(ZIGZAG, 60)!;
    // 4 straights + 3 connectors, interleaved: S C S C S C S
    expect(g.segments).toHaveLength(7);
    expect(g.segments.map((s) => s.kind)).toEqual([
      "straight", "curve", "straight", "curve", "straight", "curve", "straight",
    ]);
    // start = top of first straight, finish = bottom of last
    expect(g.start).toEqual({ x: 600, y: 140 });
    expect(g.finish).toEqual({ x: 100, y: 2060 });
    // full path starts at start, single M
    expect(g.d.startsWith("M 600 140")).toBe(true);
    expect(g.d.match(/M /g)).toHaveLength(1);
    // three cubic connectors in the full path
    expect(g.d.match(/C /g)).toHaveLength(3);
  });

  it("marks same-x connectors as straight (vertical mobile mode)", () => {
    const vertical = [
      { x: 24, y: 200 },
      { x: 24, y: 800 },
      { x: 24, y: 1400 },
    ];
    const g = buildTrackGeometry(vertical, 40)!;
    expect(g.segments.every((s) => s.kind === "straight")).toBe(true);
  });

  it("clamps straightHalf so straights never overlap the connector span", () => {
    const tight = [
      { x: 600, y: 100 },
      { x: 100, y: 220 }, // only 120px apart
    ];
    const g = buildTrackGeometry(tight, 60)!;
    // straightHalf clamped to < half the anchor gap; no NaN, connector span positive
    expect(g.d).not.toContain("NaN");
    expect(g.start.y).toBeGreaterThanOrEqual(100 - 60);
    expect(g.finish.y).toBeLessThanOrEqual(220 + 60);
  });
});
