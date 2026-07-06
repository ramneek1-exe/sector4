import { describe, it, expect } from "vitest";
import { emblemForGroup, emblemSvgMarkup } from "./emblems";

describe("emblemForGroup", () => {
  it("maps existing groups unchanged", () => {
    expect(emblemForGroup("Tyres & strategy")).toBe("tyre");
    expect(emblemForGroup("Pace & sessions")).toBe("car");
    expect(emblemForGroup("Air & aero")).toBe("airflow");
  });
  it("maps the two new groups", () => {
    expect(emblemForGroup("Race control")).toBe("flag");
    expect(emblemForGroup("Power & energy")).toBe("battery");
  });
});

describe("emblemSvgMarkup", () => {
  it("renders the new emblems as non-empty svg carrying the color", () => {
    for (const kind of ["flag", "battery"] as const) {
      const svg = emblemSvgMarkup(kind, "#123456");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("#123456");
    }
  });
});
