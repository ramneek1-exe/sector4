import { describe, expect, it } from "vitest";
import { asciiRowsFor, RAMP, sampleAscii } from "@/app/lib/ascii";

/** Build a width*height RGBA buffer where every pixel is the given colour+alpha. */
function solid(width: number, height: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return data;
}

describe("sampleAscii", () => {
  it("fully-opaque fill → darkest ramp char, colour preserved", () => {
    const data = solid(4, 4, [255, 0, 0, 255]); // red
    const grid = sampleAscii(data, 4, 4, 2, { rows: 2, threshold: 0.18 });
    expect(grid.cols).toBe(2);
    expect(grid.rows).toBe(2);
    for (const cell of grid.cells) {
      expect(cell.ch).toBe(RAMP[RAMP.length - 1]); // "@"
      expect(cell.color).toBe("#ff0000"); // team colour retained
    }
  });

  it("fully-transparent → empty cells", () => {
    const data = solid(4, 4, [255, 0, 0, 0]);
    const grid = sampleAscii(data, 4, 4, 2, { rows: 2 });
    for (const cell of grid.cells) {
      expect(cell.ch).toBe("");
      expect(cell.color).toBeNull();
    }
  });

  it("colour is alpha-weighted (edge alpha doesn't wash the hue out)", () => {
    // One opaque blue pixel + three transparent pixels in a 2x2 cell.
    const data = new Uint8ClampedArray(2 * 2 * 4);
    data[0] = 0;
    data[1] = 0;
    data[2] = 255;
    data[3] = 255; // opaque blue at (0,0)
    const grid = sampleAscii(data, 2, 2, 1, { rows: 1, threshold: 0.1 });
    expect(grid.cells[0].color).toBe("#0000ff"); // pure blue, not diluted
  });

  it("coverage below threshold is dropped", () => {
    // Mean alpha = 0.25; threshold 0.5 → empty.
    const data = solid(2, 2, [10, 20, 30, Math.round(0.25 * 255)]);
    const grid = sampleAscii(data, 2, 2, 1, { rows: 1, threshold: 0.5 });
    expect(grid.cells[0].ch).toBe("");
  });

  it("asciiRowsFor keeps aspect proportional for monospace cells", () => {
    // Wider-than-tall source → fewer rows than cols.
    expect(asciiRowsFor(732, 611, 34, 0.55)).toBeGreaterThan(0);
    expect(asciiRowsFor(732, 611, 34, 0.55)).toBeLessThan(34);
  });
});
