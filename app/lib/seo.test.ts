import { describe, it, expect } from "vitest";
import { routeMetadata, SITE_URL } from "./seo";

describe("routeMetadata", () => {
  it("suffixes the OG/twitter title but leaves the plain title bare (layout template adds the suffix there)", () => {
    const m = routeMetadata({ title: "Tyre Degradation", description: "desc", path: "/learn/tyre-degradation" });
    expect(m.title).toBe("Tyre Degradation");
    expect((m.openGraph as { title: string }).title).toBe("Tyre Degradation · Sector 4");
    expect((m.twitter as { title: string }).title).toBe("Tyre Degradation · Sector 4");
  });

  it("sets canonical and per-route og/twitter url from the given path", () => {
    const m = routeMetadata({ title: "Ask", description: "desc", path: "/ask" });
    expect(m.alternates).toEqual({ canonical: "/ask" });
    expect((m.openGraph as { url: string }).url).toBe("/ask");
  });

  it("carries the description through unchanged to metadata, openGraph, and twitter", () => {
    const m = routeMetadata({ title: "Learn", description: "A glossary.", path: "/learn" });
    expect(m.description).toBe("A glossary.");
    expect((m.openGraph as { description: string }).description).toBe("A glossary.");
    expect((m.twitter as { description: string }).description).toBe("A glossary.");
  });

  it("is fully self-contained: type/siteName/card/images never rely on parent inheritance", () => {
    const m = routeMetadata({ title: "Ask", description: "desc", path: "/ask" });
    const og = m.openGraph as { type: string; siteName: string; images: unknown[] };
    const tw = m.twitter as { card: string; images: unknown[] };
    expect(og.type).toBe("website");
    expect(og.siteName).toBe("Sector 4");
    expect(og.images).toHaveLength(1);
    expect(tw.card).toBe("summary_large_image");
    expect(tw.images).toHaveLength(1);
  });

  it("titleMode absolute bypasses the layout's suffix template for the plain title, but OG/twitter titles have no suffix either", () => {
    const m = routeMetadata({ title: "Sector 4", description: "desc", path: "/", titleMode: "absolute" });
    expect(m.title).toEqual({ absolute: "Sector 4" });
    expect((m.openGraph as { title: string }).title).toBe("Sector 4");
    expect((m.twitter as { title: string }).title).toBe("Sector 4");
  });
});

describe("SITE_URL", () => {
  it("is the bare apex domain, no trailing slash", () => {
    expect(SITE_URL).toBe("https://sector4.net");
  });
});
