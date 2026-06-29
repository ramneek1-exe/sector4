import { describe, expect, it } from "vitest";
import { NAV_LINKS, isActiveLink } from "./SiteNav";

describe("NAV_LINKS", () => {
  it("is the three nav links in order", () => {
    expect(NAV_LINKS.map((l) => l.href)).toEqual(["/", "/learn", "/weekend"]);
    expect(NAV_LINKS.map((l) => l.label)).toEqual(["Ask", "Learn", "Upcoming weekend"]);
  });
});

describe("isActiveLink", () => {
  it("matches the root href only on exact '/'", () => {
    expect(isActiveLink("/", "/")).toBe(true);
    expect(isActiveLink("/learn", "/")).toBe(false);
  });
  it("matches non-root hrefs by prefix", () => {
    expect(isActiveLink("/learn", "/learn")).toBe(true);
    expect(isActiveLink("/learn/drs", "/learn")).toBe(true);
    expect(isActiveLink("/weekend", "/weekend")).toBe(true);
    expect(isActiveLink("/", "/learn")).toBe(false);
  });
});
