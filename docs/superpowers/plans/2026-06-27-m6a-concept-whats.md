# M6-A Concept Whats + `/learn` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the educational core of the learning layer — 8 hand-authored teaching concepts at a `/learn` surface, each a structured mini-explainer with a trust badge.

**Architecture:** A single static-imported `concepts.json` (like `drivers.json`) backs pure accessors in `concepts.ts`. Server-rendered `/learn` index + `/learn/[slug]` pages read those accessors and render with the existing type system. A presentational `TrustBadge` integrity component is reused later by C. No external retrieval, no new runtime deps.

**Tech Stack:** Next.js App Router (server components for `/learn`), TypeScript, Tailwind, vitest. Spec: `docs/superpowers/specs/2026-06-27-m6a-concept-whats-design.md`.

## Global Constraints

- **No invented facts / allowlist sources only.** Concept content is hand-authored from allowlisted sources (Formula 1 glossary, Wikipedia); every concept carries a `sources` list. (PRD §6.6)
- **Ships as `"drafted"`.** All 8 concepts ship `badge: "drafted"`; the owner promotes to `"verified"` by editing `concepts.json`. (Spec §4)
- **Badge is an integrity signal, not a disclaimer hedge.** Deliberate, well-typeset. (PRD §6.6)
- **Round every number that reaches output.** (CLAUDE.md) — applies to any numbers in copy.
- **Motion behind `prefers-reduced-motion`; no new heavy deps; `body` is plain paragraphs (no markdown engine).** (Spec §1, §5)
- **Type system:** Bebas Neue = display, Lastik = body, Space Grotesk = labels, PP Mondwest (`font-pixel-serif`) = section headings. Bebas is wordmark/display only. (CLAUDE.md, Spec §5)
- **Out of scope (do NOT build): inline narrative linking + drawer (B); corrections form, retrieval/cache/TTL, `community-reviewed` promotion (C).**

---

### Task 1: Concept data model + accessors

**Files:**
- Create: `app/lib/concepts.ts`
- Test: `app/lib/concepts.test.ts`

**Interfaces:**
- Produces:
  - `type Badge = "verified" | "drafted" | "community-reviewed"`
  - `interface Concept { slug: string; term: string; group: string; summary: string; body: string[]; whyItMatters: string; related: string[]; badge: Badge; sources: { label: string; url: string }[] }`
  - `allConcepts(): Concept[]`
  - `getConcept(slug: string): Concept | undefined`
  - `conceptsByGroup(): { group: string; concepts: Concept[] }[]` — groups in first-appearance order
  - `resolveRelated(slug: string): Concept[]` — maps a concept's `related` slugs to concepts, dropping unknowns
  - `badgeLabel(badge: Badge): string` — `"verified"→"Verified"`, `"drafted"→"Drafted · unverified"`, `"community-reviewed"→"Community-reviewed"`

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/concepts.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/data/concepts.json", () => ({
  default: [
    { slug: "a", term: "A", group: "G1", summary: "s", body: ["p"], whyItMatters: "w", related: ["b", "ghost"], badge: "drafted", sources: [{ label: "L", url: "http://x" }] },
    { slug: "b", term: "B", group: "G2", summary: "s", body: ["p"], whyItMatters: "w", related: [], badge: "verified", sources: [] },
    { slug: "c", term: "C", group: "G1", summary: "s", body: ["p"], whyItMatters: "w", related: [], badge: "drafted", sources: [] },
  ],
}));

import { allConcepts, getConcept, conceptsByGroup, resolveRelated, badgeLabel } from "./concepts";

describe("concepts accessors", () => {
  it("allConcepts returns every concept", () => {
    expect(allConcepts().map((c) => c.slug)).toEqual(["a", "b", "c"]);
  });
  it("getConcept finds by slug and misses to undefined", () => {
    expect(getConcept("a")?.term).toBe("A");
    expect(getConcept("nope")).toBeUndefined();
  });
  it("conceptsByGroup groups in first-appearance order", () => {
    const g = conceptsByGroup();
    expect(g.map((x) => x.group)).toEqual(["G1", "G2"]);
    expect(g[0].concepts.map((c) => c.slug)).toEqual(["a", "c"]);
  });
  it("resolveRelated maps slugs to concepts and drops unknowns", () => {
    expect(resolveRelated("a").map((c) => c.slug)).toEqual(["b"]); // "ghost" dropped
  });
  it("badgeLabel maps each badge to its label", () => {
    expect(badgeLabel("verified")).toBe("Verified");
    expect(badgeLabel("drafted")).toBe("Drafted · unverified");
    expect(badgeLabel("community-reviewed")).toBe("Community-reviewed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/concepts.test.ts`
Expected: FAIL — `Cannot find module './concepts'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/lib/concepts.ts
// Concept whats — the hand-authored educational core of the learning layer (M6-A).
// Single static-imported JSON (bundler-safe, like drivers.json); accessors are pure so
// pages stay trivial. Badge enum already carries "community-reviewed" for C (no re-schema).
import data from "@/app/data/concepts.json";

export type Badge = "verified" | "drafted" | "community-reviewed";

export interface Concept {
  slug: string;
  term: string;
  group: string;
  summary: string;
  body: string[];
  whyItMatters: string;
  related: string[];
  badge: Badge;
  sources: { label: string; url: string }[];
}

const CONCEPTS = data as Concept[];
const BY_SLUG = new Map(CONCEPTS.map((c) => [c.slug, c]));

export function allConcepts(): Concept[] {
  return CONCEPTS;
}

export function getConcept(slug: string): Concept | undefined {
  return BY_SLUG.get(slug);
}

export function conceptsByGroup(): { group: string; concepts: Concept[] }[] {
  const groups: { group: string; concepts: Concept[] }[] = [];
  for (const c of CONCEPTS) {
    let g = groups.find((x) => x.group === c.group);
    if (!g) groups.push((g = { group: c.group, concepts: [] }));
    g.concepts.push(c);
  }
  return groups;
}

export function resolveRelated(slug: string): Concept[] {
  const c = BY_SLUG.get(slug);
  if (!c) return [];
  return c.related.map((s) => BY_SLUG.get(s)).filter((x): x is Concept => x !== undefined);
}

const BADGE_LABELS: Record<Badge, string> = {
  verified: "Verified",
  drafted: "Drafted · unverified",
  "community-reviewed": "Community-reviewed",
};

export function badgeLabel(badge: Badge): string {
  return BADGE_LABELS[badge];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/concepts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/concepts.ts app/lib/concepts.test.ts
git commit -m "feat: concept-what data model + pure accessors"
```

---

### Task 2: Author the 8 concepts + consistency test

**Files:**
- Create: `app/data/concepts.json`
- Test: `app/lib/concepts.consistency.test.ts`

**Interfaces:**
- Consumes: `allConcepts`, `getConcept`, `resolveRelated`, `Badge` (Task 1).
- Produces: the real `app/data/concepts.json` consumed by every page task.

- [ ] **Step 1: Write the full content file**

```json
[
  {
    "slug": "tyre-degradation",
    "term": "Tyre Degradation",
    "group": "Tyres & strategy",
    "summary": "How a tyre loses grip and pace as a stint goes on — the core driver of race strategy.",
    "body": [
      "As a tyre runs, heat and wear gradually reduce the grip it can deliver, so lap times creep up over a stint. This loss is 'degradation', or 'deg'. Softer compounds are faster when fresh but degrade quicker; harder compounds give up outright pace for longer life.",
      "Deg isn't linear or identical for every car — track surface, temperature, fuel load and how a driver manages the tyre all change the rate. Teams measure it in practice long runs to estimate how many laps a set stays competitive."
    ],
    "whyItMatters": "Sector 4's stop-count model leans on degradation measured in Friday practice — steeper deg points toward an extra stop. It's the telemetry signal that actually beats a track-history baseline.",
    "related": ["stop-count-strategy", "undercut-overcut", "track-evolution"],
    "badge": "drafted",
    "sources": [
      { "label": "Formula 1 — official glossary", "url": "https://www.formula1.com/en/latest" },
      { "label": "Wikipedia — Formula One tyres", "url": "https://en.wikipedia.org/wiki/Formula_One_tyres" }
    ]
  },
  {
    "slug": "undercut-overcut",
    "term": "Undercut / Overcut",
    "group": "Tyres & strategy",
    "summary": "Two ways to gain track position by timing a pit stop earlier or later than a rival.",
    "body": [
      "An undercut pits earlier than the car ahead: fresh tyres give an immediate pace boost, so you bank lap time while the rival is still on worn rubber, then emerge ahead once they stop. An overcut is the opposite — staying out longer, betting your older tyres in clean air beat a rival who pitted into traffic or whose new tyres take time to switch on.",
      "Which one works depends on degradation, how much time the pit lane costs, and traffic. High-deg tracks favour the undercut; circuits where it's hard to follow can reward the overcut."
    ],
    "whyItMatters": "These are the moves a stop-count call sets up. When Sector 4 flags a likely two-stop, the undercut or overcut is the on-track lever teams use to make it pay.",
    "related": ["tyre-degradation", "stop-count-strategy", "pit-lane-time-loss", "dirty-air"],
    "badge": "drafted",
    "sources": [
      { "label": "Formula 1 — official glossary", "url": "https://www.formula1.com/en/latest" },
      { "label": "Wikipedia — Glossary of motorsport terms", "url": "https://en.wikipedia.org/wiki/Glossary_of_motorsport_terms" }
    ]
  },
  {
    "slug": "stop-count-strategy",
    "term": "Stop-Count Strategy",
    "group": "Tyres & strategy",
    "summary": "Whether a race is run on one pit stop or two — the strategic spine of a Grand Prix.",
    "body": [
      "The pit-stop count is the headline strategic choice: fewer stops mean less time lost in the pit lane but more laps on tyres past their best; more stops mean fresher rubber but repeated pit-lane losses. The break-even depends on how fast tyres degrade versus how much a stop costs.",
      "Most dry races settle into a dominant pattern — a one-stop or two-stop race — though teams split strategies to cover each other and react to safety cars."
    ],
    "whyItMatters": "This is Sector 4's one validated telemetry edge: a model trained on practice degradation predicts per-driver stop count better than a track-history baseline. We surface it as a supporting call, always caveated for safety cars.",
    "related": ["tyre-degradation", "undercut-overcut", "pit-lane-time-loss"],
    "badge": "drafted",
    "sources": [
      { "label": "Formula 1 — official glossary", "url": "https://www.formula1.com/en/latest" },
      { "label": "Wikipedia — Formula One racing", "url": "https://en.wikipedia.org/wiki/Formula_One_racing" }
    ]
  },
  {
    "slug": "pit-lane-time-loss",
    "term": "Pit-Lane Time Loss",
    "group": "Tyres & strategy",
    "summary": "The total time a pit stop costs versus staying out — pit-lane transit plus the stop itself.",
    "body": [
      "Every stop loses time: the car slows to the pit-lane speed limit, drives its length, and sits stationary for the tyre change. Added up against a flying lap, that's the 'pit-loss' — typically around 20 seconds, but it varies a lot by circuit depending on pit-lane length and layout.",
      "The stationary part — the actual change — is only about 2 to 3 seconds of it; most of the loss is the slow transit through the pit lane."
    ],
    "whyItMatters": "Pit-loss sets the break-even for strategy: the higher it is, the more a stop has to be worth. Sector 4 computes it per circuit from real data, so the strategy explanations rest on the actual cost at each track.",
    "related": ["stop-count-strategy", "undercut-overcut"],
    "badge": "drafted",
    "sources": [
      { "label": "Formula 1 — official glossary", "url": "https://www.formula1.com/en/latest" },
      { "label": "Wikipedia — Pit stop", "url": "https://en.wikipedia.org/wiki/Pit_stop" }
    ]
  },
  {
    "slug": "qualifying-vs-race-pace",
    "term": "Qualifying vs. Race Pace",
    "group": "Pace & sessions",
    "summary": "Why a car's one-lap qualifying speed can differ from its long-run race pace.",
    "body": [
      "Qualifying rewards a single low-fuel lap on fresh soft tyres with everything turned up. Race pace is about sustaining competitive lap times over a stint — heavy fuel, managing tyre wear, and looking after the car. A team can be strong at one and ordinary at the other.",
      "That gap is why grid position and race result often diverge, and why practice long runs — not the quick laps — are the better read on Sunday pace."
    ],
    "whyItMatters": "Sector 4's pace model predicts long-run race-pace gaps, not qualifying — and Phase 1 found that's a supporting context signal, not a podium edge. The grid (qualifying) remains the strongest single podium predictor.",
    "related": ["track-evolution", "tyre-degradation"],
    "badge": "drafted",
    "sources": [
      { "label": "Formula 1 — official glossary", "url": "https://www.formula1.com/en/latest" },
      { "label": "Wikipedia — Formula One racing", "url": "https://en.wikipedia.org/wiki/Formula_One_racing" }
    ]
  },
  {
    "slug": "track-evolution",
    "term": "Track Evolution",
    "group": "Pace & sessions",
    "summary": "How a circuit gets faster across a weekend as rubber builds up and the surface cleans.",
    "body": [
      "A 'green' track at the start of practice is slow and slippery. As cars lap, they lay down rubber and sweep away dust, raising grip — so lap times tumble through the weekend even if nothing about the cars changes. This is 'track evolution', or 'rubbering in'.",
      "It complicates comparisons: a time set on Friday isn't directly comparable to one on Saturday, and the last runners in qualifying often benefit from the cleanest, fastest track."
    ],
    "whyItMatters": "When Sector 4 compares practice pace across sessions, it corrects for evolution — otherwise a later, faster lap looks like a quicker car rather than just a quicker track.",
    "related": ["qualifying-vs-race-pace", "tyre-degradation"],
    "badge": "drafted",
    "sources": [
      { "label": "Formula 1 — official glossary", "url": "https://www.formula1.com/en/latest" },
      { "label": "Wikipedia — Racing line", "url": "https://en.wikipedia.org/wiki/Racing_line" }
    ]
  },
  {
    "slug": "dirty-air",
    "term": "Dirty Air",
    "group": "Air & aero",
    "summary": "The turbulent wake behind a car that robs the one following of downforce and grip.",
    "body": [
      "F1 cars make most of their grip from aerodynamics, which need clean, smooth airflow. Running closely behind another car puts you in its turbulent 'dirty air', cutting downforce — so the following car slides, struggles in corners, and overheats its tyres.",
      "This is why following closely is hard and why overtaking often needs a big pace gap or help from DRS. Recent rules aimed to reduce the effect, but it never disappears."
    ],
    "whyItMatters": "Dirty air shapes whether track position can be held or lost — context for why an overcut into clean air can beat fresher tyres stuck in traffic.",
    "related": ["drs", "undercut-overcut"],
    "badge": "drafted",
    "sources": [
      { "label": "Formula 1 — official glossary", "url": "https://www.formula1.com/en/latest" },
      { "label": "Wikipedia — Downforce", "url": "https://en.wikipedia.org/wiki/Downforce" }
    ]
  },
  {
    "slug": "drs",
    "term": "DRS (Drag Reduction System)",
    "group": "Air & aero",
    "summary": "A driver-activated rear-wing flap that cuts drag to aid overtaking on straights.",
    "body": [
      "The Drag Reduction System opens a flap in the rear wing on designated straights, reducing drag and adding straight-line speed. A driver can use it when within one second of the car ahead at a detection point, giving a closing-speed boost to attempt a pass.",
      "In the race it's only available once enabled and when within that one-second window, and it's disabled in wet or dangerous conditions. DRS zones and detection points are set per circuit."
    ],
    "whyItMatters": "DRS partly offsets dirty air, so where and how many DRS zones a track has affects how easily positions change — background to how a predicted strategy actually plays out.",
    "related": ["dirty-air"],
    "badge": "drafted",
    "sources": [
      { "label": "Formula 1 — official glossary", "url": "https://www.formula1.com/en/latest" },
      { "label": "Wikipedia — Drag reduction system", "url": "https://en.wikipedia.org/wiki/Drag_reduction_system" }
    ]
  }
]
```

- [ ] **Step 2: Write the consistency test**

```ts
// app/lib/concepts.consistency.test.ts
import { describe, it, expect } from "vitest";
import { allConcepts, getConcept } from "./concepts";

const BADGES = ["verified", "drafted", "community-reviewed"];

describe("concepts.json integrity", () => {
  const concepts = allConcepts();

  it("ships exactly the 8 starter concepts", () => {
    expect(concepts.length).toBe(8);
  });

  it("every concept has all required fields populated", () => {
    for (const c of concepts) {
      expect(c.slug, "slug").toBeTruthy();
      expect(c.term, `${c.slug} term`).toBeTruthy();
      expect(c.group, `${c.slug} group`).toBeTruthy();
      expect(c.summary, `${c.slug} summary`).toBeTruthy();
      expect(c.body.length, `${c.slug} body`).toBeGreaterThan(0);
      expect(c.whyItMatters, `${c.slug} whyItMatters`).toBeTruthy();
      expect(c.sources.length, `${c.slug} sources`).toBeGreaterThan(0);
      expect(BADGES, `${c.slug} badge`).toContain(c.badge);
    }
  });

  it("ships all concepts as drafted (owner promotes to verified)", () => {
    expect(concepts.every((c) => c.badge === "drafted")).toBe(true);
  });

  it("slugs are unique", () => {
    const slugs = concepts.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every related slug resolves to a real concept", () => {
    for (const c of concepts) {
      for (const r of c.related) {
        expect(getConcept(r), `${c.slug} -> ${r}`).toBeDefined();
      }
    }
  });

  it("every source has a label and an https url", () => {
    for (const c of concepts) {
      for (const s of c.sources) {
        expect(s.label, `${c.slug} source label`).toBeTruthy();
        expect(s.url.startsWith("https://"), `${c.slug} source url`).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 3: Run the consistency test**

Run: `npx vitest run app/lib/concepts.consistency.test.ts`
Expected: PASS (6 tests). If a `related` slug fails, fix the typo in `concepts.json`.

- [ ] **Step 4: Commit**

```bash
git add app/data/concepts.json app/lib/concepts.consistency.test.ts
git commit -m "feat: author 8 starter concept whats (drafted) + integrity test"
```

---

### Task 3: TrustBadge component

**Files:**
- Create: `app/components/TrustBadge.tsx`

**Interfaces:**
- Consumes: `Badge`, `badgeLabel` (Task 1).
- Produces: `TrustBadge({ badge }: { badge: Badge })` — a presentational integrity chip.

- [ ] **Step 1: Write the component**

```tsx
// app/components/TrustBadge.tsx
// Trust/integrity signal for a "what" (M6-A) — deliberate and well-typeset, NOT a
// disclaimer hedge (PRD §6.6). Verified reads settled; drafted reads honest, not alarmist.
// "community-reviewed" is wired for C. Presentational only; label logic lives in concepts.ts.
import { badgeLabel, type Badge } from "@/app/lib/concepts";

const STYLES: Record<Badge, string> = {
  verified: "border-accent/40 bg-accent/10 text-accent",
  drafted: "border-ink/15 bg-ink/[0.03] text-muted",
  "community-reviewed": "border-ink/20 bg-ink/[0.04] text-ink/70",
};

export function TrustBadge({ badge }: { badge: Badge }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-grotesk text-[11px] font-semibold uppercase tracking-wide ${STYLES[badge]}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {badgeLabel(badge)}
    </span>
  );
}
```

- [ ] **Step 2: Verify it type-checks via build**

Run: `npx tsc --noEmit`
Expected: no errors. (Presentational component; its label logic is already unit-tested in `concepts.test.ts`.)

- [ ] **Step 3: Commit**

```bash
git add app/components/TrustBadge.tsx
git commit -m "feat: TrustBadge integrity component"
```

---

### Task 4: `/learn` index page

**Files:**
- Create: `app/learn/page.tsx`

**Interfaces:**
- Consumes: `conceptsByGroup` (Task 1), `TrustBadge` (Task 3).

- [ ] **Step 1: Write the index page**

```tsx
// app/learn/page.tsx
// /learn index (M6-A): a "Learn" section heading in PP Mondwest, then the concept cards
// grouped thematically. Server component — static, legibility-first (no active fog).
import Link from "next/link";
import { conceptsByGroup } from "@/app/lib/concepts";
import { TrustBadge } from "@/app/components/TrustBadge";

export const metadata = { title: "Learn — Sector 4" };

export default function LearnPage() {
  const groups = conceptsByGroup();
  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      <header className="mb-12">
        <h1 className="font-pixel-serif text-5xl text-ink sm:text-6xl">Learn</h1>
        <p className="mt-3 max-w-prose font-lastik text-muted">
          The ideas behind the predictions — tyres, strategy, pace, and air. Short,
          grounded explainers you can read in a minute.
        </p>
      </header>

      {groups.map(({ group, concepts }) => (
        <section key={group} className="mb-12">
          <h2 className="mb-4 font-grotesk text-xs font-semibold uppercase tracking-wide text-muted">
            {group}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {concepts.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/learn/${c.slug}`}
                  className="legible flex h-full flex-col gap-2 rounded-2xl border border-ink/10 bg-white/80 p-4 transition hover:border-accent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-grotesk text-base font-bold text-ink">{c.term}</span>
                    <TrustBadge badge={c.badge} />
                  </div>
                  <span className="font-lastik text-sm text-muted">{c.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 2: Build and verify the route renders**

Run: `npm run build`
Expected: build succeeds and the output route list includes `○ /learn` (static).

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, open `http://localhost:3000/learn`.
Expected: a pixel-serif "Learn" heading; 3 group sections ("Tyres & strategy", "Pace & sessions", "Air & aero"); 8 cards total, each with term + summary + a "Drafted · unverified" badge; cards link to `/learn/<slug>`.

- [ ] **Step 4: Commit**

```bash
git add app/learn/page.tsx
git commit -m "feat: /learn index page (grouped concept cards)"
```

---

### Task 5: `/learn/[slug]` concept page

**Files:**
- Create: `app/learn/[slug]/page.tsx`

**Interfaces:**
- Consumes: `allConcepts`, `getConcept`, `resolveRelated` (Task 1), `TrustBadge` (Task 3).

- [ ] **Step 1: Write the concept page**

```tsx
// app/learn/[slug]/page.tsx
// A single concept what (M6-A): term, badge, summary lead, body, a set-apart "Why it
// matters" callout, related chips, and sources. Statically generated over the 8 slugs.
import Link from "next/link";
import { notFound } from "next/navigation";
import { allConcepts, getConcept, resolveRelated } from "@/app/lib/concepts";
import { TrustBadge } from "@/app/components/TrustBadge";

export function generateStaticParams() {
  return allConcepts().map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const c = getConcept(params.slug);
  return { title: c ? `${c.term} — Sector 4` : "Learn — Sector 4" };
}

export default function ConceptPage({ params }: { params: { slug: string } }) {
  const concept = getConcept(params.slug);
  if (!concept) notFound();
  const related = resolveRelated(concept.slug);

  return (
    <main className="mx-auto max-w-2xl px-5 py-14 sm:py-20">
      <Link href="/learn" className="font-grotesk text-xs text-muted transition hover:text-ink">
        ← Learn
      </Link>

      <header className="mt-6 mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-bebas text-5xl leading-none text-ink sm:text-6xl">{concept.term}</h1>
          <TrustBadge badge={concept.badge} />
        </div>
        <p className="mt-4 font-lastik text-lg text-ink/80">{concept.summary}</p>
      </header>

      <div className="space-y-4 font-lastik text-ink/90">
        {concept.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <aside className="legible my-8 rounded-2xl border border-accent/30 bg-accent/[0.06] p-5">
        <h2 className="mb-2 font-grotesk text-xs font-semibold uppercase tracking-wide text-accent">
          Why it matters
        </h2>
        <p className="font-lastik text-ink/85">{concept.whyItMatters}</p>
      </aside>

      {related.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-grotesk text-xs font-semibold uppercase tracking-wide text-muted">
            Related
          </h2>
          <ul className="flex flex-wrap gap-2">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/learn/${r.slug}`}
                  className="inline-block rounded-full border border-ink/10 px-3 py-1 font-grotesk text-sm text-ink/80 transition hover:border-accent hover:text-ink"
                >
                  {r.term}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t border-ink/10 pt-5">
        <h2 className="mb-2 font-grotesk text-xs font-semibold uppercase tracking-wide text-muted">
          Sources
        </h2>
        <ul className="space-y-1">
          {concept.sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-grotesk text-sm text-muted underline decoration-ink/20 underline-offset-2 transition hover:text-ink"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Build and verify static generation**

Run: `npm run build`
Expected: build succeeds; output shows `/learn/[slug]` statically generated for 8 paths (`●` or 8 prerendered entries).

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, open `http://localhost:3000/learn/tyre-degradation`.
Expected: Bebas term + drafted badge, summary lead, 2 body paragraphs, a "Why it matters" callout, related chips (Stop-Count Strategy / Undercut Overcut / Track Evolution) that navigate, and 2 source links. Open `/learn/does-not-exist` → 404.

- [ ] **Step 4: Commit**

```bash
git add app/learn/[slug]/page.tsx
git commit -m "feat: /learn/[slug] concept page"
```

---

### Task 6: "Ask" heading + "Learn" nav link on the home page

**Files:**
- Modify: `app/page.tsx` (intro copy region ~line 256; the `<Link href="/weekend">` CTA region ~line 290)

**Interfaces:**
- Consumes: nothing new (uses `next/link`, already imported; `font-pixel-serif` Tailwind class).

- [ ] **Step 1: Add the "Ask" pixel-serif heading near the intro copy**

In `app/page.tsx`, locate the intro line containing `Ask about a 2024–25 race weekend` and add a heading directly above its wrapping element:

```tsx
<h1 className="font-pixel-serif text-5xl text-ink sm:text-6xl">Ask</h1>
```

(Place it so it sits above the existing intro paragraph in the empty/pre-query state — sibling to the intro `<p>`, matching the page's existing centered column layout.)

- [ ] **Step 2: Add the "Learn" nav link beside the existing `/weekend` CTA**

Next to the existing `<Link href="/weekend">…Upcoming weekend odds →</Link>`, add:

```tsx
<Link
  href="/learn"
  className="rounded-full px-2 py-0.5 font-grotesk text-sm text-muted transition hover:bg-ink/5 hover:text-ink"
>
  Learn
</Link>
```

(Match the surrounding wrapper/spacing of the `/weekend` CTA so the two links sit together.)

- [ ] **Step 3: Build and type-check**

Run: `npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 4: Manually verify**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: a pixel-serif "Ask" heading in the empty state; a "Learn" link near the "Upcoming weekend odds →" CTA that navigates to `/learn`. Toggle OS reduced-motion → no new animation introduced.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: Ask heading + Learn nav link on the home page"
```

---

### Task 7: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full vitest suite**

Run: `npx vitest run`
Expected: all pass (existing suites + the new `concepts.test.ts`, `concepts.consistency.test.ts`).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: clean; route list includes static `/learn` and prerendered `/learn/[slug]` (8 paths).

- [ ] **Step 3: Confirm no out-of-scope additions**

Verify by inspection: no corrections-form endpoint, no retrieval/cache code, no inline narrative linking — those are B and C.

- [ ] **Step 4: Commit any final touch-ups**

```bash
git add -A
git commit -m "chore: M6-A verification pass" --allow-empty
```

---

## Self-Review

**Spec coverage:**
- Data model & storage (Spec §1) → Task 1 (`concepts.ts`) + Task 2 (`concepts.json`). ✓
- Surface & routing: `/learn` index, `/learn/[slug]`, Learn nav (Spec §2) → Tasks 4, 5, 6. ✓
- TrustBadge integrity component (Spec §3) → Task 3. ✓
- 8 authored concepts, grouped, shipped "drafted" (Spec §4) → Task 2. ✓
- PP Mondwest "Learn" + "Ask" headings; legibility-first, reduced-motion (Spec §5) → Tasks 4, 6 (+ §5 honored: no fog added). ✓
- Out-of-scope (corrections/retrieval/inline-link) → explicitly excluded; Task 7 Step 3 guards it. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — full code and content given. `notFound()` handles the unknown-slug edge; the consistency test guards content integrity. ✓

**Type consistency:** `Concept`, `Badge`, `allConcepts`, `getConcept`, `conceptsByGroup`, `resolveRelated`, `badgeLabel` are defined in Task 1 and consumed with identical signatures in Tasks 2–6. `TrustBadge({ badge })` defined in Task 3, consumed identically in Tasks 4–5. ✓

**Note for executor:** `app/page.tsx` is a `"use client"` component; placing a static `<h1>` and a `<Link>` in it is fine. Exact line numbers drift — locate by the quoted copy (`Ask about a 2024–25 race weekend`) and the existing `href="/weekend"` CTA rather than by line.
