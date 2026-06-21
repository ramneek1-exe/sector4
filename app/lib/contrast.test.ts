import { describe, it, expect } from "vitest";
import { contrastGuard, INK, WHITE } from "./contrast";

describe("contrastGuard", () => {
  it("keeps the personal color when it contrasts enough with the helmet", () => {
    expect(contrastGuard("#FFFFFF", "#0B1E6B")).toBe("#FFFFFF");
  });
  it("falls back to ink on a light helmet when the personal color is too pale", () => {
    expect(contrastGuard("#FFF6B0", "#F2F2F2")).toBe(INK);
  });
  it("falls back to white on a dark helmet when the personal color is too dark", () => {
    expect(contrastGuard("#101522", "#0B1020")).toBe(WHITE);
  });
});
