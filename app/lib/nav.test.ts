import { describe, it, expect } from "vitest";
import { isLandingRoute } from "./nav";

describe("isLandingRoute", () => {
  it("is true only for the exact root path", () => {
    expect(isLandingRoute("/")).toBe(true);
  });
  it("is false for any other path", () => {
    expect(isLandingRoute("/ask")).toBe(false);
    expect(isLandingRoute("/weekend")).toBe(false);
    expect(isLandingRoute("")).toBe(false);
  });
});
