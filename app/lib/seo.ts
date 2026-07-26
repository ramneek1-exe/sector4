// Shared SEO metadata helpers. The root layout's `openGraph`/`twitter` blocks are
// STATIC objects, so any page that doesn't set its own gets the homepage's title/url
// verbatim (Next does not auto-derive og:title/og:url from a page's own `title` once
// the tree already declares openGraph explicitly). Every non-home route should build
// its Metadata through `routeMetadata` so og/twitter/canonical always match that page.
//
// IMPORTANT: Next does NOT deep-merge `openGraph`/`twitter` across the layout tree —
// a page that sets its own `openGraph` object REPLACES the parent's wholesale, and
// that also silently drops the automatic opengraph-image.tsx/twitter-image.tsx file-
// convention image injection (verified in-browser: a page with its own bare
// `openGraph: { title, url }` lost og:type, og:site_name, twitter:card, AND og:image
// entirely, not just the fields it didn't set). So every route's `openGraph`/`twitter`
// here must be fully self-contained, not a partial override.
import type { Metadata } from "next";

export const SITE_URL = "https://sector4.net";

const TITLE_SUFFIX = " · Sector 4";
const SITE_NAME = "Sector 4";
const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Sector 4: an explainer-led F1 weekend companion",
};

export function routeMetadata({
  title,
  description,
  path,
  titleMode = "template",
}: {
  title: string;
  description: string;
  path: string;
  /** "absolute" bypasses the root layout's "%s · Sector 4" template (home only). */
  titleMode?: "template" | "absolute";
}): Metadata {
  const full = titleMode === "absolute" ? title : `${title}${TITLE_SUFFIX}`;
  return {
    title: titleMode === "absolute" ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: full,
      description,
      url: path,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: full,
      description,
      images: [OG_IMAGE],
    },
  };
}
