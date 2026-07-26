import type { MetadataRoute } from "next";
import { sitemapRoutes } from "@/app/lib/sitemap-routes";
import { SITE_URL } from "@/app/lib/seo";

// No priority/changefreq: Google ignores both. No real per-page lastmod exists
// (concepts.json carries no edit-date field), so every entry gets one build-time
// value rather than a fabricated per-page date.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return sitemapRoutes().map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
  }));
}
