# M6-C Entity-What Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generated, cited, cached, badged "whats" for circuits, drivers, and teams — precomputed in R17, surfaced through the M6-B popover + the `/weekend` block, with a corrections form.

**Architecture:** An R17 Node script fetches an allowlist source (Wikipedia) and paraphrases via Haiku into a committed `entity-whats.json`. The app reads that static JSON (no request-time LLM). Entity whats surface via the generalized M6-B `ConceptPopover` (inline links for circuit/team names, glyph-tap for drivers) and the `/weekend` circuit block. A "spotted something wrong?" form posts to `/api/correction`, which opens a GitHub issue.

**Tech Stack:** Next.js App Router + TS; node-only vitest; a Node generation script (Anthropic SDK + Wikipedia REST); GitHub REST API; R17 GitHub Action.

## Global Constraints

- **Precompute only** — generation happens in R17, never at request time. The app reads the committed `app/data/entity-whats.json`.
- **Hard rules for any generated what (enforced in prompt + post-process):** short ORIGINAL paraphrase, **never reproduced passages**, always **cited with a link**, **allowlist source only** (Wikipedia v1), "do not invent facts", and **no em-dashes** (existing house rule for all user-facing copy).
- **Hard facts from structured data, never cached prose:** driver→team and car number come from `app/data/drivers.json`; team colours from `app/data/teams.json`. `entity-whats.json` is prose only.
- **Badges:** new generated whats = `"drafted"`; hand-promoted to `"verified"` by editing the JSON; R17 regen resets a `verified` badge to `"drafted"` iff the regenerated `summary` differs from the stored `contentHash`. Concept whats (M6-A) are untouched.
- **No standalone bios / no entity `/learn/[slug]` pages** — whats are contextual (popover + `/weekend`); the popover "read more" for an entity is its **citation link**.
- **Reuse M6-B:** `linkify.ts` (`Segment`, `linkifyNarrative`), `ConceptPopover` (`useConceptPopover(): (slug, anchor)=>void`, `ConceptPopoverProvider`), `NarrativeText`, `TrustBadge` (`{ badge: "verified"|"drafted"|"community-reviewed" }`).
- **Data shapes:** `drivers.json` = `{ CODE: { name, number, personalColor } }`; `teams.json` = `{ TeamName: { primary, secondary } }`; `EntityWhat` key = `"<type>:<slug>"` (e.g. `circuit:Austria`, `driver:VER`, `team:McLaren`).
- Round numbers that reach output; node-only vitest (`environment: "node"`, `app/**/*.test.ts`); no AI attribution in commits; conventional commits.

---

### Task 1: EntityWhat data model + accessors + retire the circuit-facts seam

**Files:**
- Create: `app/lib/entity-whats.ts`, `app/data/entity-whats.json` (hand-seed a few records so downstream tasks have data; Task 8 regenerates the full set)
- Modify: `app/lib/orchestrate.ts` (import `getCircuitFacts` from the new module), delete `app/lib/circuit-facts.ts`
- Test: `app/lib/entity-whats.test.ts`

**Interfaces:**
- Produces: `type EntityWhat = { type: "circuit"|"driver"|"team"; slug: string; title: string; summary: string; source: { label: string; url: string }; badge: "drafted"|"verified"|"community-reviewed"; generatedAt: string; contentHash: string; track?: string }`; `getEntityWhat(type, slug): EntityWhat | undefined`; `getCircuitFacts(gp): string[]` (summary sentence-split); `getCircuitName(gp): string`; `entityKey(type, slug): string`.

- [ ] **Step 1: Seed `app/data/entity-whats.json`** with 3 hand-written records (real data comes in Task 8) so the accessors + downstream tasks have something to read:

```json
{
  "circuit:Austria": {
    "type": "circuit", "slug": "Austria", "title": "the Red Bull Ring", "track": "the Red Bull Ring",
    "summary": "The Red Bull Ring is one of the shortest laps on the calendar at about 4.3 km. It sits high in the Styrian hills, where the thinner air trims engine and aero performance. With only ten corners and three long straights, it rewards power and traction and bunches the field into its heavy braking zones.",
    "source": { "label": "Wikipedia", "url": "https://en.wikipedia.org/wiki/Red_Bull_Ring" },
    "badge": "drafted", "generatedAt": "2026-07-01T00:00:00Z", "contentHash": "seed"
  },
  "driver:VER": {
    "type": "driver", "slug": "VER", "title": "Max Verstappen",
    "summary": "A Dutch driver who reached Formula 1 at seventeen and became one of the sport's dominant forces, known for aggressive wheel-to-wheel racing and exceptional wet-weather pace.",
    "source": { "label": "Wikipedia", "url": "https://en.wikipedia.org/wiki/Max_Verstappen" },
    "badge": "drafted", "generatedAt": "2026-07-01T00:00:00Z", "contentHash": "seed"
  },
  "team:McLaren": {
    "type": "team", "slug": "McLaren", "title": "McLaren",
    "summary": "One of the most successful teams in Formula 1 history, founded by Bruce McLaren in the 1960s and long associated with technical innovation and a strong constructors' record.",
    "source": { "label": "Wikipedia", "url": "https://en.wikipedia.org/wiki/McLaren" },
    "badge": "drafted", "generatedAt": "2026-07-01T00:00:00Z", "contentHash": "seed"
  }
}
```

- [ ] **Step 2: Write the failing test** — `app/lib/entity-whats.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getEntityWhat, getCircuitFacts, getCircuitName, entityKey } from "./entity-whats";

describe("entity-whats accessors", () => {
  it("keys by type:slug", () => {
    expect(entityKey("driver", "VER")).toBe("driver:VER");
    expect(getEntityWhat("driver", "VER")?.title).toBe("Max Verstappen");
    expect(getEntityWhat("team", "Nowhere")).toBeUndefined();
  });
  it("getCircuitFacts sentence-splits the summary (drop-in for /weekend)", () => {
    const facts = getCircuitFacts("Austria");
    expect(Array.isArray(facts)).toBe(true);
    expect(facts.length).toBeGreaterThan(1);
    expect(facts.every((f) => f.trim().length > 0 && !f.includes("  "))).toBe(true);
  });
  it("getCircuitName returns the track display name, or the gp key when absent", () => {
    expect(getCircuitName("Austria")).toBe("the Red Bull Ring");
    expect(getCircuitName("Nowhere")).toBe("Nowhere");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/lib/entity-whats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `app/lib/entity-whats.ts`**

```typescript
// Entity whats (M6-C): auto-generated, cited, cached, badged prose for circuits/drivers/teams.
// Read-only over the committed app/data/entity-whats.json (generated in R17). Hard facts live in
// drivers.json/teams.json, NEVER here — this file is prose only.
import data from "@/app/data/entity-whats.json";
import type { Badge } from "@/app/lib/concepts";

export type EntityType = "circuit" | "driver" | "team";
export type EntityWhat = {
  type: EntityType;
  slug: string;
  title: string;
  summary: string;
  source: { label: string; url: string };
  badge: Badge;
  generatedAt: string;
  contentHash: string;
  track?: string; // circuits only: display track name for the /weekend block
};

const WHATS = data as Record<string, EntityWhat>;

export const entityKey = (type: EntityType, slug: string): string => `${type}:${slug}`;

export function getEntityWhat(type: EntityType, slug: string): EntityWhat | undefined {
  return WHATS[entityKey(type, slug)];
}

// Split prose into sentences, keeping terminal punctuation, dropping empties.
function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

// The /weekend seam (replaces app/lib/circuit-facts.ts). Same signatures, now over entity whats.
export function getCircuitFacts(gp: string): string[] {
  const w = getEntityWhat("circuit", gp);
  return w ? sentences(w.summary) : [];
}
export function getCircuitName(gp: string): string {
  return getEntityWhat("circuit", gp)?.track ?? gp;
}
```

- [ ] **Step 5: Retire `circuit-facts.ts`, repoint `orchestrate.ts`**

In `app/lib/orchestrate.ts`, change `import { getCircuitFacts } from "./circuit-facts";` to `import { getCircuitFacts } from "./entity-whats";`. Then `git rm app/lib/circuit-facts.ts` (and `git rm app/lib/circuit-facts.test.ts` if present — its behavior is now covered by entity-whats.test.ts; confirm no other importer with `grep -rn "circuit-facts" app`).

- [ ] **Step 6: Run tests + tsc**

Run: `npx vitest run app/lib/entity-whats.test.ts` → PASS.
Run: `npx tsc --noEmit` → clean. Run: `grep -rn "circuit-facts" app` → only comments, no imports.

- [ ] **Step 7: Commit**

```bash
git add app/lib/entity-whats.ts app/data/entity-whats.json app/lib/orchestrate.ts
git rm app/lib/circuit-facts.ts
git commit -m "feat: entity-whats data model + accessors, retire circuit-facts seam"
```

---

### Task 2: Diff-aware merge (badge reset on content change)

**Files:**
- Create: `app/lib/entity-merge.ts`
- Test: `app/lib/entity-merge.test.ts`

**Interfaces:**
- Consumes: `EntityWhat` (Task 1).
- Produces: `contentHash(summary: string): string`; `mergeWhat(prev: EntityWhat | undefined, next: { type, slug, title, summary, source, track? }, now: string): EntityWhat` — sets `contentHash`, `generatedAt`, and the badge: a NEW record is `"drafted"`; an unchanged record keeps `prev.badge`; a `verified` record whose summary changed resets to `"drafted"`.

- [ ] **Step 1: Write the failing test** — `app/lib/entity-merge.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { contentHash, mergeWhat } from "./entity-merge";

const base = { type: "driver" as const, slug: "VER", title: "Max Verstappen",
  source: { label: "Wikipedia", url: "u" } };

describe("mergeWhat", () => {
  it("new record starts drafted", () => {
    const out = mergeWhat(undefined, { ...base, summary: "A" }, "2026-07-01T00:00:00Z");
    expect(out.badge).toBe("drafted");
    expect(out.contentHash).toBe(contentHash("A"));
  });
  it("verified + unchanged summary stays verified", () => {
    const prev = { ...base, summary: "A", badge: "verified" as const, generatedAt: "x", contentHash: contentHash("A") };
    expect(mergeWhat(prev, { ...base, summary: "A" }, "now").badge).toBe("verified");
  });
  it("verified + changed summary resets to drafted", () => {
    const prev = { ...base, summary: "A", badge: "verified" as const, generatedAt: "x", contentHash: contentHash("A") };
    expect(mergeWhat(prev, { ...base, summary: "B" }, "now").badge).toBe("drafted");
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run app/lib/entity-merge.test.ts` → FAIL.

- [ ] **Step 3: Implement `app/lib/entity-merge.ts`**

```typescript
import { createHash } from "node:crypto";
import type { EntityWhat } from "@/app/lib/entity-whats";

export function contentHash(summary: string): string {
  return createHash("sha256").update(summary.trim()).digest("hex").slice(0, 16);
}

type Built = Pick<EntityWhat, "type" | "slug" | "title" | "summary" | "source"> & { track?: string };

export function mergeWhat(prev: EntityWhat | undefined, next: Built, now: string): EntityWhat {
  const hash = contentHash(next.summary);
  const changed = !prev || prev.contentHash !== hash;
  // NEW -> drafted. Unchanged -> keep prev badge. Changed (incl. a verified one) -> drafted.
  const badge = !prev ? "drafted" : changed ? "drafted" : prev.badge;
  return { ...next, badge, generatedAt: now, contentHash: hash };
}
```

- [ ] **Step 4: Run to verify it passes.** `npx vitest run app/lib/entity-merge.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/entity-merge.ts app/lib/entity-merge.test.ts
git commit -m "feat: diff-aware entity-what merge (badge resets on content change)"
```

---

### Task 3: Corrections — payload builder + `/api/correction` route

**Files:**
- Create: `app/lib/correction.ts`, `app/api/correction/route.ts`
- Test: `app/lib/correction.test.ts`

**Interfaces:**
- Produces: `validateCorrection(body: unknown): { type: EntityType; slug: string; note: string } | { error: string }`; `issuePayload(c): { title: string; body: string; labels: string[] }`. The route consumes both.

- [ ] **Step 1: Write the failing test** — `app/lib/correction.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateCorrection, issuePayload } from "./correction";

describe("validateCorrection", () => {
  it("accepts a well-formed correction and trims/caps the note", () => {
    const ok = validateCorrection({ type: "circuit", slug: "Austria", note: "  wrong length  " });
    expect(ok).toEqual({ type: "circuit", slug: "Austria", note: "wrong length" });
  });
  it("rejects a bad type, missing slug, empty or oversized note", () => {
    expect("error" in validateCorrection({ type: "nope", slug: "x", note: "hi" })).toBe(true);
    expect("error" in validateCorrection({ type: "circuit", note: "hi" })).toBe(true);
    expect("error" in validateCorrection({ type: "circuit", slug: "x", note: "  " })).toBe(true);
    expect("error" in validateCorrection({ type: "circuit", slug: "x", note: "a".repeat(2001) })).toBe(true);
  });
});

describe("issuePayload", () => {
  it("builds a labelled issue naming the entity + note", () => {
    const p = issuePayload({ type: "driver", slug: "VER", note: "typo" });
    expect(p.title).toBe("Correction: driver/VER");
    expect(p.labels).toContain("correction");
    expect(p.body).toContain("VER");
    expect(p.body).toContain("typo");
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run app/lib/correction.test.ts` → FAIL.

- [ ] **Step 3: Implement `app/lib/correction.ts`**

```typescript
import type { EntityType } from "@/app/lib/entity-whats";

const TYPES = new Set<EntityType>(["circuit", "driver", "team"]);
export type Correction = { type: EntityType; slug: string; note: string };

export function validateCorrection(body: unknown): Correction | { error: string } {
  const b = body as Record<string, unknown>;
  if (!b || !TYPES.has(b.type as EntityType)) return { error: "invalid type" };
  if (typeof b.slug !== "string" || !b.slug.trim()) return { error: "slug required" };
  if (typeof b.note !== "string" || !b.note.trim()) return { error: "note required" };
  const note = b.note.trim();
  if (note.length > 2000) return { error: "note too long" };
  return { type: b.type as EntityType, slug: b.slug.trim(), note };
}

export function issuePayload(c: Correction): { title: string; body: string; labels: string[] } {
  return {
    title: `Correction: ${c.type}/${c.slug}`,
    body: `Reader-submitted correction for **${c.type} ${c.slug}**.\n\n> ${c.note}\n\n(via the "spotted something wrong?" form)`,
    labels: ["correction"],
  };
}
```

- [ ] **Step 4: Run to verify it passes.** `npx vitest run app/lib/correction.test.ts` → PASS.

- [ ] **Step 5: Implement the route `app/api/correction/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { validateCorrection, issuePayload } from "@/app/lib/correction";

// Opens a GitHub issue for a reader correction. Token + repo are server-only env vars.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const c = validateCorrection(body);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: 400 });

  const token = process.env.GITHUB_CORRECTIONS_TOKEN;
  const repo = process.env.GITHUB_CORRECTIONS_REPO; // e.g. "ramneek1-exe/sector4"
  if (!token || !repo) return NextResponse.json({ error: "corrections not configured" }, { status: 503 });

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(issuePayload(c)),
  });
  if (!res.ok) return NextResponse.json({ error: "could not file the correction" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Verify build + tsc**

Run: `npx tsc --noEmit` → clean; `npm run build` → clean (route compiles).

- [ ] **Step 7: Commit**

```bash
git add app/lib/correction.ts app/lib/correction.test.ts app/api/correction/route.ts
git commit -m "feat: corrections endpoint opens a labelled GitHub issue"
```

Note (owner setup, not code): add Vercel env vars `GITHUB_CORRECTIONS_TOKEN` (a fine-grained PAT with issues:write on the repo) and `GITHUB_CORRECTIONS_REPO`.

---

### Task 4: Generalize the popover to render an entity what

**Files:**
- Modify: `app/components/ConceptPopover.tsx`
- Test: (component — verified by build + reasoning; no jsdom harness. Add a pure resolver test if extracted.)

**Interfaces:**
- Consumes: `getEntityWhat` (Task 1), `getConcept` (M6-A), `TrustBadge`.
- Produces: the popover's `open(key, anchor)` now accepts EITHER a concept slug (e.g. `"drs"`) OR an entity key (`"circuit:Austria"`, `"driver:VER"`, `"team:McLaren"`). Entity keys render the entity what (title, summary, `TrustBadge`, a "Source →" citation link, and a corrections affordance); concept keys render as before (with the `/learn/[slug]` link).

- [ ] **Step 1: Extract + test a pure resolver.** Add to `app/lib/entity-whats.ts`:

```typescript
// A popover key is either "type:slug" (entity) or a bare concept slug.
export function parsePopoverKey(key: string): { kind: "entity"; what: EntityWhat } | { kind: "concept"; slug: string } | null {
  const i = key.indexOf(":");
  if (i > 0) {
    const type = key.slice(0, i) as EntityType;
    const what = getEntityWhat(type, key.slice(i + 1));
    return what ? { kind: "entity", what } : null;
  }
  return { kind: "concept", slug: key };
}
```

Add a test to `app/lib/entity-whats.test.ts`:

```typescript
import { parsePopoverKey } from "./entity-whats";
it("parsePopoverKey resolves entity keys vs concept slugs", () => {
  const e = parsePopoverKey("driver:VER");
  expect(e && e.kind === "entity" && e.what.title).toBe("Max Verstappen");
  const c = parsePopoverKey("drs");
  expect(c && c.kind).toBe("concept");
  expect(parsePopoverKey("team:Nowhere")).toBeNull();
});
```

Run: `npx vitest run app/lib/entity-whats.test.ts` → RED then implement then GREEN.

- [ ] **Step 2: Wire it into `ConceptPopover.tsx`.** In the inner `ConceptPopover({ slug, anchor, onClose })`, replace the `const concept = getConcept(slug)` lookup with `const parsed = parsePopoverKey(slug)`. Branch the render:
  - `parsed.kind === "concept"` → the existing concept render (unchanged: term, `TrustBadge`, summary, `/learn/${parsed.slug}` "Read more").
  - `parsed.kind === "entity"` → render `parsed.what.title`, `TrustBadge badge={parsed.what.badge}`, `parsed.what.summary`, a `<a href={parsed.what.source.url} target="_blank" rel="noreferrer">Source: {parsed.what.source.label} →</a>`, and the corrections affordance (Task 5's `<CorrectionForm type slug />`, imported).
  - `parsed === null` → render nothing (return null), same as the current missing-concept guard.
  Keep the existing positioning, outside-click/Escape close, portal, `role="dialog"`, and reduced-motion behavior untouched.

- [ ] **Step 3: Verify.** `npx tsc --noEmit` clean; `npm run build` clean; existing M6-B popover behavior unchanged for concept keys.

- [ ] **Step 4: Commit**

```bash
git add app/components/ConceptPopover.tsx app/lib/entity-whats.ts app/lib/entity-whats.test.ts
git commit -m "feat: popover renders concept OR entity what (citation + badge)"
```

---

### Task 5: Corrections form component + surfaces (inline links + driver glyph tap + /weekend)

**Files:**
- Create: `app/components/CorrectionForm.tsx`
- Modify: `app/lib/linkify.ts` (add entity aliases), `app/components/AsciiGlyph.tsx` + `app/components/DriverGlyph.tsx` (tap → driver popover), `app/weekend/page.tsx` (badge + citation + corrections on the About block)
- Test: `app/lib/linkify.test.ts` (extend)

**Interfaces:**
- Consumes: `useConceptPopover()` (opens with an entity key), `entityKey`, `getEntityWhat`, `validateCorrection` shape.
- Produces: `<CorrectionForm type slug />` (a one-field note that POSTs to `/api/correction`); entity aliases in `linkify` so circuit/team names become popover links; a tappable driver glyph.

- [ ] **Step 1: `CorrectionForm.tsx`** — a small controlled "spotted something wrong?" disclosure that POSTs `{ type, slug, note }` to `/api/correction`, showing a thank-you on success and an honest inline error on failure. (No em-dashes; `font-grotesk text-[11px]` to match the badge/meta scale; reduced-motion safe.)

- [ ] **Step 2: Extend `linkify.ts` with entity aliases.** Today `ALIASES` is built from `allConcepts()`. Add entity aliases so circuit + team NAMES linkify to their entity key. Build a second alias list from `entity-whats.json` circuit + team records (alias = the title/track and the slug; value = the entity key `"<type>:<slug>"`). Merge with the concept aliases into the one longest-first list `linkifyNarrative` already sorts. Drivers are NOT linkified inline (they surface via glyph tap). Add a test:

```typescript
it("linkifies a circuit/team name to its entity key", () => {
  const segs = linkifyNarrative("Expect a busy race at the Red Bull Ring for McLaren.");
  const keys = segs.filter((s) => typeof s !== "string").map((s: any) => s.slug);
  expect(keys).toContain("circuit:Austria");
  expect(keys).toContain("team:McLaren");
});
```

`NarrativeText` already opens `open(seg.slug, rect)` — since `seg.slug` is now sometimes an entity key, and Task 4 made the popover accept entity keys, no change to `NarrativeText` is needed (verify).

- [ ] **Step 3: Driver glyph tap.** In `AsciiGlyph.tsx` (and the `DriverGlyph.tsx` SSR fallback), wrap the glyph in an accessible `<button>` that calls `useConceptPopover()` `open(entityKey("driver", code), rect)` on click, with `aria-label={\`About ${driverName}\`}`. Only render the button when a driver what exists (`getEntityWhat("driver", code)`), otherwise the plain glyph (no dead affordance). Keep the visual glyph unchanged; add `focus-visible` ring + `cursor-pointer`.

- [ ] **Step 4: `/weekend` About block.** In `app/weekend/page.tsx`, under the circuit facts, add the circuit what's `TrustBadge`, a "Source →" citation (`getEntityWhat("circuit", gp)?.source`), and `<CorrectionForm type="circuit" slug={gp} />`. (The facts themselves already come from the swapped `getCircuitFacts` seam.)

- [ ] **Step 5: Verify.** `npx vitest run app/lib/linkify.test.ts` → PASS; `npx tsc --noEmit` clean; `npm run build` clean.

- [ ] **Step 6: Commit**

```bash
git add app/components/CorrectionForm.tsx app/lib/linkify.ts app/lib/linkify.test.ts app/components/AsciiGlyph.tsx app/components/DriverGlyph.tsx app/weekend/page.tsx
git commit -m "feat: surface entity whats (inline links, driver glyph tap, /weekend) + corrections form"
```

---

### Task 6: Generation script (Wikipedia + Haiku paraphrase + merge)

**Files:**
- Create: `scripts/build-entity-whats.mjs`, `app/data/entity-titles.json` (per-entity Wikipedia title map)
- Test: `app/lib/paraphrase.ts` + `app/lib/paraphrase.test.ts` (the pure post-processor)

**Interfaces:**
- Consumes: `mergeWhat`/`contentHash` (Task 2), `drivers.json`, `teams.json`, `RACE_CALENDAR`.
- Produces: `sanitizeParaphrase(text: string, maxSentences=3): string` (pure: strip em-dashes, collapse whitespace, cap sentence count, trim); the script writes/merges `app/data/entity-whats.json`.

- [ ] **Step 1: Pure post-processor test** — `app/lib/paraphrase.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { sanitizeParaphrase } from "./paraphrase";
it("strips em-dashes, collapses whitespace, caps sentences", () => {
  const out = sanitizeParaphrase("One thing — a dash.  Two. Three. Four. Five.", 3);
  expect(out).not.toContain("—");
  expect(out.match(/[.!?]/g)?.length).toBe(3);
  expect(out).not.toContain("  ");
});
```

- [ ] **Step 2: Run RED**, then **implement `app/lib/paraphrase.ts`**:

```typescript
// Post-process a Haiku paraphrase: enforce the house rules (no em-dashes) and a tight length.
export function sanitizeParaphrase(text: string, maxSentences = 3): string {
  const noDash = text.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
  const parts = noDash.match(/[^.!?]+[.!?]+/g) ?? [noDash];
  return parts.slice(0, maxSentences).join(" ").trim();
}
```

Run GREEN.

- [ ] **Step 3: `app/data/entity-titles.json`** — map each entity slug to its exact Wikipedia article title so citations point at the right page (a wrong title yields no what, never a guess):

```json
{
  "circuit": { "Austria": "Red Bull Ring", "Great Britain": "Silverstone Circuit", "Monaco": "Circuit de Monaco" },
  "driver": { "VER": "Max Verstappen", "NOR": "Lando Norris", "LEC": "Charles Leclerc" },
  "team": { "McLaren": "McLaren", "Ferrari": "Scuderia Ferrari", "Red Bull Racing": "Red Bull Racing" }
}
```
(Seed the current roster; the script skips any entity with no mapped title and logs it.)

- [ ] **Step 4: Implement `scripts/build-entity-whats.mjs`** (Node ESM). It: reads `entity-titles.json`, `drivers.json`, `teams.json`, and the existing `entity-whats.json` (as `prev`); for each entity with a title, fetches `https://en.wikipedia.org/api/rest_v1/page/summary/<encoded title>` (the REST summary → `extract` + `content_urls.desktop.page`); calls Haiku (`@anthropic-ai/sdk`, model `claude-haiku-4-5-20251001`) with a PARAPHRASE system prompt (short ORIGINAL paraphrase of the provided extract, never quote it, no invented facts, no em-dashes, 2-3 sentences); runs `sanitizeParaphrase`; builds the record via `mergeWhat(prev[key], { type, slug, title, summary, source, track? }, now)`; writes the merged map back to `app/data/entity-whats.json` (stable key order, 2-space indent, trailing newline). Reuse `contentHash`/`mergeWhat` by importing the compiled TS or duplicating the tiny helpers with a comment pointing at the source of truth. Print a per-entity line (built / skipped-no-title / unchanged) and a summary count.

- [ ] **Step 5: Smoke-run it** (needs network + `ANTHROPIC_API_KEY`):

```bash
ANTHROPIC_API_KEY=... node scripts/build-entity-whats.mjs
```
Spot-check `app/data/entity-whats.json`: each new record has a real Wikipedia `source.url`, a 2-3 sentence `summary` with no em-dashes and no quoted passages, and `badge: "drafted"`. Verify `npx tsc --noEmit` + `npm run build` are clean with the regenerated data.

- [ ] **Step 6: Commit** (code + the regenerated data)

```bash
git add scripts/build-entity-whats.mjs app/data/entity-titles.json app/lib/paraphrase.ts app/lib/paraphrase.test.ts app/data/entity-whats.json
git commit -m "feat: generate entity whats from Wikipedia via Haiku paraphrase"
```

---

### Task 7: Wire generation into R17 + full verification

**Files:**
- Modify: `.github/workflows/refresh-weekend-data.yml`

- [ ] **Step 1: Add a generation step** to the workflow after the data build: set up Node, `npm ci` (or reuse the existing Node setup), run `node scripts/build-entity-whats.mjs` with `ANTHROPIC_API_KEY` from repo secrets, and `git add app/data/entity-whats.json` so the refresh commit carries it. Mirror the change into `docs/ops/refresh-weekend-data.yml` if that mirror still exists.

- [ ] **Step 2: Confirm the secret.** Note in the step comment that `ANTHROPIC_API_KEY` must be a repo Actions secret (owner action if absent). The script must fail loudly (non-zero exit) if the key is missing so a silent no-generation run is impossible.

- [ ] **Step 3: Full suites.** Run and confirm each:
- `npx vitest run` → all pass (entity-whats, entity-merge, correction, paraphrase, linkify + existing).
- `npx tsc --noEmit` clean; `npm run build` clean (19+ routes incl. `/api/correction`).
- `grep -rn "circuit-facts" app` → no live imports (only the retired reference).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/refresh-weekend-data.yml docs/ops/refresh-weekend-data.yml
git commit -m "chore: R17 generates + commits entity whats each weekend"
```

---

## Self-Review

**Spec coverage:**
- Precompute in R17 → Tasks 6 (script) + 7 (workflow). ✓
- Data model + `entity-whats.json` + hard-facts-elsewhere → Task 1. ✓
- Generation hard rules (paraphrase/cite/allowlist/no-em-dash) → Task 6 (prompt + `sanitizeParaphrase`). ✓
- Diff-aware badge reset / TTL → Task 2 (`mergeWhat`). ✓
- Surfaces: `/weekend` seam + inline links + driver glyph tap → Tasks 1 (seam) + 5. ✓
- Popover renders concept OR entity what + citation → Task 4. ✓
- Corrections → GitHub issue → Task 3 (+ form in Task 5). ✓
- Badges (drafted default, hand-verify) → Tasks 1/2. ✓
- Testing (node-only vitest for pure cores; route mocked; script smoke) → each task. ✓

**Placeholder scan:** every code step shows full code; the integration steps (popover branch, glyph button, weekend block, script, workflow) give concrete file+behavior with the key snippets. No TBD/TODO. ✓

**Type consistency:** `EntityWhat`, `EntityType`, `entityKey`, `getEntityWhat` defined in Task 1 are used verbatim in Tasks 2/4/5/6; `parsePopoverKey` defined in Task 4; `mergeWhat`/`contentHash` in Task 2 consumed by Task 6; `validateCorrection`/`issuePayload` in Task 3 consumed by the route + Task 5 form. Popover key convention (`"type:slug"` vs bare concept slug) consistent across Tasks 4/5. ✓

**Scope note:** large but one cohesive pipeline; Tasks 1-3 are pure/testable cores, 4-5 the surfaces, 6-7 the generation + ops. Each ends independently testable; the hand-seeded `entity-whats.json` (Task 1) lets Tasks 2-5 proceed before the real generation (Task 6).
