import { describe, it, expect } from "vitest";
import { LOADING_LINES, pickLoadingLine } from "./loading-lines";

describe("loading lines", () => {
  it("has the full owner-authored set", () => {
    expect(LOADING_LINES.length).toBe(15);
    expect(LOADING_LINES).toContain("Bwoahhh...");
    expect(LOADING_LINES).toContain("Leaving the space for Fernando...");
  });

  it("pickLoadingLine returns a member of the list", () => {
    for (let i = 0; i < 50; i++) expect(LOADING_LINES).toContain(pickLoadingLine());
  });
});
