import { describe, it, expect } from "vitest";
import {
  organizationJsonLd,
  websiteJsonLd,
  breadcrumbJsonLd,
  conceptArticleJsonLd,
  learnCollectionJsonLd,
  sportsEventJsonLd,
  webPageJsonLd,
  jsonLdGraph,
} from "./json-ld";
import type { Concept } from "./concepts";

const CONCEPT: Concept = {
  slug: "drs",
  term: "DRS",
  group: "Air & aero",
  summary: "A rear-wing flap drivers can open on straights to reduce drag.",
  aliases: [],
  body: [],
  whyItMatters: "w",
  related: [],
  badge: "verified",
  sources: [],
};

describe("organizationJsonLd", () => {
  it("points logo at the larger apple-icon, not the 64x64 favicon", () => {
    expect(organizationJsonLd().logo).toBe("https://sector4.net/apple-icon");
  });
  it("carries no team/driver marks (name/url/logo only)", () => {
    expect(Object.keys(organizationJsonLd()).sort()).toEqual(["@type", "logo", "name", "url"]);
  });
});

describe("websiteJsonLd", () => {
  it("targets the real /ask?q= param with a SearchAction", () => {
    const w = websiteJsonLd();
    expect(w.potentialAction.target).toBe("https://sector4.net/ask?q={search_term_string}");
    expect(w.potentialAction["query-input"]).toBe("required name=search_term_string");
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers items 1-based in the given order with absolute URLs", () => {
    const b = breadcrumbJsonLd([
      { name: "Learn", path: "/learn" },
      { name: "DRS", path: "/learn/drs" },
    ]);
    expect(b.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Learn", item: "https://sector4.net/learn" },
      { "@type": "ListItem", position: 2, name: "DRS", item: "https://sector4.net/learn/drs" },
    ]);
  });
});

describe("conceptArticleJsonLd", () => {
  it("maps concept fields into Article + embedded DefinedTerm, no fabricated dates", () => {
    const a = conceptArticleJsonLd(CONCEPT);
    expect(a).toEqual({
      "@type": "Article",
      headline: "DRS",
      description: CONCEPT.summary,
      url: "https://sector4.net/learn/drs",
      about: { "@type": "DefinedTerm", name: "DRS", description: CONCEPT.summary },
    });
    expect(a).not.toHaveProperty("datePublished");
    expect(a).not.toHaveProperty("dateModified");
  });
});

describe("learnCollectionJsonLd", () => {
  it("builds a positioned ItemList from term/slug pairs", () => {
    const c = learnCollectionJsonLd([{ term: "DRS", slug: "drs" }, { term: "Marbles", slug: "marbles" }]);
    expect(c.mainEntity.itemListElement.map((i) => i.name)).toEqual(["DRS", "Marbles"]);
    expect(c.mainEntity.itemListElement[1].url).toBe("https://sector4.net/learn/marbles");
  });
});

describe("sportsEventJsonLd", () => {
  it("has no Offer or AggregateRating (would read as betting odds)", () => {
    const e = sportsEventJsonLd({ gpLabel: "Hungarian", startDate: "2026-07-26T13:00:00Z" });
    expect(e).not.toHaveProperty("offers");
    expect(e).not.toHaveProperty("aggregateRating");
    expect(e.name).toBe("Hungarian Grand Prix");
    expect(e.startDate).toBe("2026-07-26T13:00:00Z");
  });
});

describe("webPageJsonLd", () => {
  it("builds a minimal WebPage node", () => {
    expect(webPageJsonLd({ title: "Ask", description: "d", path: "/ask" })).toEqual({
      "@type": "WebPage",
      name: "Ask",
      description: "d",
      url: "https://sector4.net/ask",
    });
  });
});

describe("jsonLdGraph", () => {
  it("wraps nodes under @context + @graph", () => {
    const g = jsonLdGraph({ "@type": "A" }, { "@type": "B" });
    expect(g["@context"]).toBe("https://schema.org");
    expect(g["@graph"]).toEqual([{ "@type": "A" }, { "@type": "B" }]);
  });
});
