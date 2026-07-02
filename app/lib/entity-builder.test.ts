import { describe, it, expect } from "vitest";
import { buildEntityRecord } from "./entity-builder";
import type { Fetcher, Summarizer } from "./entity-builder";

const STUB_URL = "https://en.wikipedia.org/wiki/Red_Bull_Ring";

const stubFetcher: Fetcher = async (_title) => ({
  extract: "The Red Bull Ring is a short motor-racing circuit in Spielberg, Austria.",
  url: STUB_URL,
});

// Summarizer that includes an em-dash to exercise sanitizeParaphrase end-to-end.
const stubSummarizer: Summarizer = async (_extract) =>
  "A compact circuit — high in the Styrian hills. It rewards raw power and traction. The lap takes about a minute.";

describe("buildEntityRecord (assembly stub test)", () => {
  it("assembles a verified record from stubbed fetch+summarize", async () => {
    const record = await buildEntityRecord(
      { type: "circuit", slug: "Austria", title: "Red Bull Ring", track: "the Red Bull Ring" },
      undefined,
      "2026-07-01T00:00:00Z",
      stubFetcher,
      stubSummarizer,
    );
    expect(record.badge).toBe("verified");
    expect(record.type).toBe("circuit");
    expect(record.slug).toBe("Austria");
    expect(record.track).toBe("the Red Bull Ring");
    expect(record.source.url).toBe(STUB_URL);
    expect(record.source.label).toBe("Wikipedia");
    expect(record.summary).not.toContain("—");
    expect(record.summary).not.toContain("  ");
    // sanitizeParaphrase caps at 3 sentences
    const sentenceCount = record.summary.match(/[.!?]/g)?.length ?? 0;
    expect(sentenceCount).toBeLessThanOrEqual(3);
    expect(record.contentHash).not.toBe("seed");
    expect(record.contentHash.length).toBe(16);
    expect(record.generatedAt).toBe("2026-07-01T00:00:00Z");
  });

  it("keeps verified badge when summary is unchanged", async () => {
    // First build to get the hash
    const first = await buildEntityRecord(
      { type: "driver", slug: "VER", title: "Max Verstappen" },
      undefined,
      "2026-07-01T00:00:00Z",
      stubFetcher,
      stubSummarizer,
    );
    // Simulate a second run with the same content but badge promoted to verified
    const promoted = { ...first, badge: "verified" as const };
    const second = await buildEntityRecord(
      { type: "driver", slug: "VER", title: "Max Verstappen" },
      promoted,
      "2026-07-02T00:00:00Z",
      stubFetcher,
      stubSummarizer,
    );
    expect(second.badge).toBe("verified");
  });

  it("re-verifies when the summary changes", async () => {
    const first = await buildEntityRecord(
      { type: "team", slug: "McLaren", title: "McLaren" },
      undefined,
      "2026-07-01T00:00:00Z",
      stubFetcher,
      stubSummarizer,
    );
    const promoted = { ...first, badge: "verified" as const };
    // New summarizer returns different content
    const changedSummarizer: Summarizer = async () => "A completely different summary text.";
    const second = await buildEntityRecord(
      { type: "team", slug: "McLaren", title: "McLaren" },
      promoted,
      "2026-07-02T00:00:00Z",
      stubFetcher,
      changedSummarizer,
    );
    expect(second.badge).toBe("verified");
  });
});
