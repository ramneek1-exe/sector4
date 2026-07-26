// Schema.org/JSON-LD builders. Pure — return plain objects, rendered via <JsonLd>.
// Deliberately excluded: FAQPage (no Google SERP benefit post-retirement), HowTo
// (deprecated), Person for drivers (no-likeness constraint, CLAUDE.md), Offer /
// AggregateRating on the race event (would read as betting odds — PRD non-goal).
import { SITE_URL } from "@/app/lib/seo";
import type { Concept } from "@/app/lib/concepts";

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    name: "Sector 4",
    url: SITE_URL,
    // 180x180 apple-icon, not the 64x64 favicon — Google recommends >=112x112 for a logo.
    logo: `${SITE_URL}/apple-icon`,
  };
}

export function websiteJsonLd() {
  return {
    "@type": "WebSite",
    name: "Sector 4",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/ask?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

export function conceptArticleJsonLd(concept: Concept) {
  return {
    "@type": "Article",
    headline: concept.term,
    description: concept.summary,
    url: `${SITE_URL}/learn/${concept.slug}`,
    about: {
      "@type": "DefinedTerm",
      name: concept.term,
      description: concept.summary,
    },
  };
}

export function learnCollectionJsonLd(terms: { term: string; slug: string }[]) {
  return {
    "@type": "CollectionPage",
    name: "Learn",
    url: `${SITE_URL}/learn`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: terms.map((t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: t.term,
        url: `${SITE_URL}/learn/${t.slug}`,
      })),
    },
  };
}

export function sportsEventJsonLd({
  gpLabel,
  startDate,
}: {
  gpLabel: string;
  startDate: string;
}) {
  return {
    "@type": "SportsEvent",
    name: `${gpLabel} Grand Prix`,
    startDate,
    location: { "@type": "Place", name: `${gpLabel} Grand Prix` },
    url: `${SITE_URL}/weekend`,
  };
}

export function webPageJsonLd({ title, description, path }: { title: string; description: string; path: string }) {
  return {
    "@type": "WebPage",
    name: title,
    description,
    url: `${SITE_URL}${path}`,
  };
}

/** Wraps one or more JSON-LD nodes in a @graph for a single script tag. */
export function jsonLdGraph(...nodes: object[]) {
  return { "@context": "https://schema.org", "@graph": nodes };
}
