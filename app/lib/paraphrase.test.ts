import { describe, it, expect } from "vitest";
import { sanitizeParaphrase } from "./paraphrase";

describe("sanitizeParaphrase", () => {
  it("strips em-dashes, collapses whitespace, caps sentences", () => {
    const out = sanitizeParaphrase("One thing — a dash.  Two. Three. Four. Five.", 3);
    expect(out).not.toContain("—");
    expect(out.match(/[.!?]/g)?.length).toBe(3);
    expect(out).not.toContain("  ");
  });

  it("replaces em-dash with comma+space", () => {
    const out = sanitizeParaphrase("Alpha — bravo. Charlie.", 3);
    expect(out).toContain(",");
    expect(out).not.toContain("—");
  });

  it("caps at maxSentences (default 3)", () => {
    const out = sanitizeParaphrase("A. B. C. D. E.");
    // default is 3 sentences
    const count = out.match(/[.!?]/g)?.length ?? 0;
    expect(count).toBeLessThanOrEqual(3);
  });

  it("handles text with no terminal punctuation gracefully", () => {
    const out = sanitizeParaphrase("No punctuation here", 3);
    expect(out).toBe("No punctuation here");
    expect(out).not.toContain("  ");
  });

  it("trims leading/trailing whitespace", () => {
    const out = sanitizeParaphrase("   Hello.   ", 3);
    expect(out).toBe("Hello.");
  });
});
