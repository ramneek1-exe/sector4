// Pure route list for app/sitemap.ts — kept separate so it's unit-testable without
// pulling in Next's MetadataRoute types. /lab/dither (noindex dev page) and /api/*
// (non-content) are deliberately excluded.
import { allConcepts } from "@/app/lib/concepts";

const STATIC_ROUTES = ["/", "/ask", "/weekend", "/learn", "/accuracy"];

export function sitemapRoutes(): string[] {
  return [...STATIC_ROUTES, ...allConcepts().map((c) => `/learn/${c.slug}`)];
}
