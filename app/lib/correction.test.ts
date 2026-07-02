import { describe, it, expect } from "vitest";
import { validateCorrection, issuePayload } from "./correction";

describe("validateCorrection", () => {
  it("accepts a well-formed correction and trims/caps the note", () => {
    const ok = validateCorrection({ type: "circuit", slug: "Austria", note: "  wrong length  " });
    expect(ok).toEqual({ type: "circuit", slug: "Austria", note: "wrong length" });
  });
  it("rejects a bad type, missing slug, empty or oversized note", () => {
    expect("error" in validateCorrection({ type: "nope", slug: "x", note: "hi" })).toBe(true);
    expect("error" in validateCorrection({ type: "circuit", note: "hi" })).toBe(true);
    expect("error" in validateCorrection({ type: "circuit", slug: "x", note: "  " })).toBe(true);
    expect("error" in validateCorrection({ type: "circuit", slug: "x", note: "a".repeat(2001) })).toBe(true);
    expect("error" in validateCorrection({ type: "circuit", slug: "s".repeat(121), note: "hi" })).toBe(true);
  });
});

describe("issuePayload", () => {
  it("builds a labelled issue naming the entity + note", () => {
    const p = issuePayload({ type: "driver", slug: "VER", note: "typo" });
    expect(p.title).toBe("Correction: driver/VER");
    expect(p.labels).toContain("correction");
    expect(p.body).toContain("VER");
    expect(p.body).toContain("typo");
  });
});
