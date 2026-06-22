import { describe, it, expect } from "vitest";
import { BAND_TEXT } from "./bands";

describe("BAND_TEXT", () => {
  it("covers all three bands with text-colour classes", () => {
    for (const band of ["strong", "in contention", "outside shot"]) {
      expect(BAND_TEXT[band]).toMatch(/^text-/);
    }
  });
});
