import { describe, it, expect } from "vitest";
import { linkifyNarrative, computePopoverPosition, type Segment } from "@/app/lib/linkify";

const links = (segs: Segment[]) => segs.filter((s): s is { text: string; slug: string } => typeof s !== "string");

describe("linkifyNarrative", () => {
  it("returns a single plain segment when nothing matches", () => {
    const segs = linkifyNarrative("The weather was sunny in the paddock.");
    expect(segs).toEqual(["The weather was sunny in the paddock."]);
  });

  it("links a known term and preserves surrounding text", () => {
    const segs = linkifyNarrative("Expect high tyre degradation here.");
    expect(segs[0]).toBe("Expect high ");
    expect(segs[1]).toEqual({ text: "tyre degradation", slug: "tyre-degradation" });
    expect(segs[2]).toBe(" here.");
  });

  it("prefers the longest matching alias at a position", () => {
    // "tyre deg" must win over the shorter "deg"
    const segs = linkifyNarrative("Watch the tyre deg closely.");
    expect(links(segs)[0]).toEqual({ text: "tyre deg", slug: "tyre-degradation" });
  });

  it("respects word boundaries (no match inside a longer word)", () => {
    const segs = linkifyNarrative("It was 12 degrees and degenerate.");
    expect(links(segs)).toHaveLength(0);
  });

  it("is case-insensitive but preserves the original casing in the segment", () => {
    const segs = linkifyNarrative("DEG is the story today.");
    expect(links(segs)[0]).toEqual({ text: "DEG", slug: "tyre-degradation" });
  });

  it("links only the first occurrence of a concept", () => {
    const segs = linkifyNarrative("Deg, more deg, even more deg.");
    expect(links(segs)).toHaveLength(1);
    expect(links(segs)[0].slug).toBe("tyre-degradation");
  });

  it("links multiple distinct concepts in one sentence", () => {
    const segs = linkifyNarrative("High degradation forces an extra stop and a pit stop.");
    const slugs = links(segs).map((l) => l.slug);
    expect(slugs).toContain("tyre-degradation");
    expect(slugs).toContain("stop-count-strategy"); // "extra stop"
    expect(slugs).toContain("pit-lane-time-loss");  // "pit stop"
  });
});

describe("computePopoverPosition", () => {
  const vp = { width: 1000, height: 800 };
  const size = { width: 288, height: 180 };

  it("places below the anchor by default and centers horizontally", () => {
    const anchor = { top: 100, bottom: 116, left: 400, width: 40 };
    const { top, left, flipped } = computePopoverPosition(anchor, size, vp);
    expect(flipped).toBe(false);
    expect(top).toBe(116 + 8);
    expect(left).toBe(400 + 20 - 144); // anchor center 420 minus half width 144
  });

  it("flips above when there is no room below but room above", () => {
    const anchor = { top: 700, bottom: 716, left: 400, width: 40 };
    const { top, flipped } = computePopoverPosition(anchor, size, vp);
    expect(flipped).toBe(true);
    expect(top).toBe(700 - 8 - 180);
  });

  it("stays below when neither side fits", () => {
    const tall = { width: 288, height: 790 };
    const anchor = { top: 5, bottom: 21, left: 400, width: 40 };
    const { flipped } = computePopoverPosition(anchor, tall, vp);
    expect(flipped).toBe(false);
  });

  it("clamps to the left edge", () => {
    const anchor = { top: 100, bottom: 116, left: 0, width: 20 };
    const { left } = computePopoverPosition(anchor, size, vp);
    expect(left).toBe(8);
  });

  it("clamps to the right edge", () => {
    const anchor = { top: 100, bottom: 116, left: 990, width: 10 };
    const { left } = computePopoverPosition(anchor, size, vp);
    expect(left).toBe(1000 - 288 - 8);
  });
});
