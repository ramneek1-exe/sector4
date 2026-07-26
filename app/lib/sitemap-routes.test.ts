import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/data/concepts.json", () => ({
  default: [
    { slug: "a", term: "A", group: "G", summary: "s", aliases: [], body: [], whyItMatters: "w", related: [], badge: "verified", sources: [] },
    { slug: "b", term: "B", group: "G", summary: "s", aliases: [], body: [], whyItMatters: "w", related: [], badge: "verified", sources: [] },
  ],
}));

import { sitemapRoutes } from "./sitemap-routes";

describe("sitemapRoutes", () => {
  it("includes every static page plus every concept slug, and nothing else", () => {
    expect(sitemapRoutes()).toEqual(["/", "/ask", "/weekend", "/learn", "/accuracy", "/learn/a", "/learn/b"]);
  });

  it("never includes /lab or /api paths", () => {
    const routes = sitemapRoutes();
    expect(routes.some((r) => r.startsWith("/lab"))).toBe(false);
    expect(routes.some((r) => r.startsWith("/api"))).toBe(false);
  });
});
