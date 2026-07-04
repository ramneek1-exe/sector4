# M7 Explainers Expansion (8 → 24) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the learning layer from 8 to 24 concept-whats across 5 groups (two new: Race control, Power & energy), each cross-linked via aliases/related, with two new ASCII emblems.

**Architecture:** Content lives in `app/data/concepts.json` (a flat array). Accessors, `/learn` pages, `TrustBadge`, and M6-B linkify are generic over the array, so this is authoring + two `emblems.ts` additions. The real-data contract is enforced by `app/lib/concepts.consistency.test.ts`.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, the existing AsciiEmblem dither pipeline.

## Global Constraints

- **No em-dashes** in any user-facing string (`term`, `summary`, `body`, `whyItMatters`). Use commas, colons, or separate sentences. Enforced by a test.
- **Badges:** the existing 8 stay `verified`; all 16 new concepts ship `badge: "drafted"`.
- **Sources: allowlisted only** — F1 official (`https://www.formula1.com/...`) and Wikipedia (`https://en.wikipedia.org/...`). Every concept has >= 1 source with a label and an `https://` url. Original paraphrase only, never reproduced passages (PRD §6.6).
- **2026-accurate:** active-aero era (DRS retired after 2025), hybrid power units drawing ~half their output from electrical power, the current regulations. Do not describe DRS as current.
- **Voice:** short, plain, for a casual fan who watches races but skips practice. Match the existing concepts (see the `drs` / `tyre-degradation` entries as exemplars): `summary` = 1 sentence; `body` = 2 to 4 short paragraphs; `whyItMatters` = 1 to 2 sentences tying the idea to how a race or our predictions play out.
- **Alias uniqueness:** no new alias may duplicate any existing alias (case-insensitive). M6-B linkify resolves longest-alias-first / first-occurrence, so duplicates mis-route. Enforced by a test.
- **§8 flag note:** the Race control emblem is a chequered flag, a nation-agnostic race symbol (not a national flag, not in a driver number), so it does not conflict with the PRD §8 "no flags" constraint. Keep a code comment saying so.

---

### Task 1: Two new emblems — `flag` + `battery`

**Files:**
- Modify: `app/lib/emblems.ts`
- Test: `app/lib/emblems.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `EmblemKind`/`SvgEmblem` include `"flag"` and `"battery"`; `emblemForGroup("Race control") === "flag"`, `emblemForGroup("Power & energy") === "battery"`; `emblemSvgMarkup("flag"|"battery", color?)` returns SVG markup.

- [ ] **Step 1: Write the failing test**

Create `app/lib/emblems.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emblemForGroup, emblemSvgMarkup } from "./emblems";

describe("emblemForGroup", () => {
  it("maps existing groups unchanged", () => {
    expect(emblemForGroup("Tyres & strategy")).toBe("tyre");
    expect(emblemForGroup("Pace & sessions")).toBe("car");
    expect(emblemForGroup("Air & aero")).toBe("airflow");
  });
  it("maps the two new groups", () => {
    expect(emblemForGroup("Race control")).toBe("flag");
    expect(emblemForGroup("Power & energy")).toBe("battery");
  });
});

describe("emblemSvgMarkup", () => {
  it("renders the new emblems as non-empty svg carrying the color", () => {
    for (const kind of ["flag", "battery"] as const) {
      const svg = emblemSvgMarkup(kind, "#123456");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("#123456");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/emblems.test.ts`
Expected: FAIL — `"flag"`/`"battery"` not assignable / mappings return `"airflow"`.

- [ ] **Step 3: Implement in `app/lib/emblems.ts`**

Add `"flag"` and `"battery"` to both `EmblemKind` and `SvgEmblem`; add their `VIEWBOX` entries; add their `shapes` markup; add the `emblemForGroup` mappings.

Type lines:

```ts
export type EmblemKind = "tyre" | "car" | "airflow" | "flag" | "battery";
export type SvgEmblem = "tyre" | "airflow" | "flag" | "battery";
```

`VIEWBOX` gains:

```ts
  flag: { w: 120, h: 120 },
  battery: { w: 120, h: 120 },
```

`emblemForGroup` (keep existing lines, add the two before the final `return`):

```ts
  if (group.startsWith("Race")) return "flag"; // Race control (chequered flag, a
    // nation-agnostic race symbol, not a national flag, so it is fine under PRD §8)
  if (group.startsWith("Power")) return "battery"; // Power & energy
```

`shapes(c)` gains two entries (single-color, dither-friendly, mirroring tyre/airflow):

```ts
  // Chequered flag on a pole. Single color, so the checker is alternating filled/empty
  // squares (the empty squares are the transparent background) plus the pole.
  flag: `
    <rect x="26" y="16" width="6" height="88" fill="${c}"/>
    <rect x="36" y="24" width="18" height="18" fill="${c}"/>
    <rect x="72" y="24" width="18" height="18" fill="${c}"/>
    <rect x="54" y="42" width="18" height="18" fill="${c}"/>
    <rect x="90" y="42" width="18" height="18" fill="${c}"/>
    <rect x="36" y="60" width="18" height="18" fill="${c}"/>
    <rect x="72" y="60" width="18" height="18" fill="${c}"/>
  `,
  // Abstract battery: cell outline + terminal nub + three charge bars.
  battery: `
    <rect x="22" y="42" width="68" height="36" rx="6" fill="none" stroke="${c}" stroke-width="7"/>
    <rect x="92" y="52" width="8" height="16" fill="${c}"/>
    <rect x="36" y="52" width="9" height="16" fill="${c}"/>
    <rect x="50" y="52" width="9" height="16" fill="${c}"/>
    <rect x="64" y="52" width="9" height="16" fill="${c}"/>
  `,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/emblems.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/lib/emblems.ts app/lib/emblems.test.ts
git commit -m "feat: flag + battery emblems for Race control and Power & energy groups"
```

---

### Task 2: Harden the concept consistency test (count-agnostic invariants)

**Files:**
- Modify: `app/lib/concepts.consistency.test.ts`

**Interfaces:**
- Consumes: `allConcepts`, `getConcept` (existing).
- Produces: real-data invariants that hold as concepts are added (group membership, kebab slug, alias uniqueness, no em-dashes) and DROP the brittle `length===8` / all-verified assertions (the final counts are locked in Task 6).

- [ ] **Step 1: Rewrite the brittle assertions + add invariants**

In `app/lib/concepts.consistency.test.ts`: delete the `it("ships exactly the 8 starter concepts", ...)` and `it("ships all concepts as verified ...")` blocks. Add an `ALLOWED_GROUPS` const near the top (after `BADGES`) and these tests inside the `describe`:

```ts
const ALLOWED_GROUPS = [
  "Tyres & strategy",
  "Pace & sessions",
  "Air & aero",
  "Race control",
  "Power & energy",
];

// (inside describe("concepts.json integrity", ...))

  it("every group is one of the allowed groups", () => {
    for (const c of concepts) {
      expect(ALLOWED_GROUPS, `${c.slug} group`).toContain(c.group);
    }
  });

  it("slugs are kebab-case", () => {
    for (const c of concepts) {
      expect(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug), `${c.slug} kebab`).toBe(true);
    }
  });

  it("aliases are globally unique across all concepts (case-insensitive)", () => {
    const seen = new Map<string, string>();
    for (const c of concepts) {
      for (const a of c.aliases) {
        const key = a.toLowerCase();
        expect(seen.has(key), `duplicate alias "${a}" (${seen.get(key)} vs ${c.slug})`).toBe(false);
        seen.set(key, c.slug);
      }
    }
  });

  it("no user-facing copy contains an em-dash", () => {
    for (const c of concepts) {
      const strings = [c.term, c.summary, c.whyItMatters, ...c.body];
      for (const s of strings) {
        expect(s.includes("—"), `${c.slug} em-dash in "${s.slice(0, 40)}"`).toBe(false);
      }
    }
  });
```

- [ ] **Step 2: Run to verify the suite is green at 8**

Run: `npx vitest run app/lib/concepts.consistency.test.ts`
Expected: PASS (the current 8 concepts satisfy every invariant; the brittle count/verified tests are gone).

- [ ] **Step 3: Commit**

```bash
git add app/lib/concepts.consistency.test.ts
git commit -m "test: count-agnostic concept invariants (group set, kebab, alias uniqueness, no em-dash)"
```

---

### Authoring standard (Tasks 3-6)

Each authoring task appends concept objects to the `app/data/concepts.json` array (before the closing `]`, comma-separating). Every object has exactly these fields (order as below), matching the existing entries:

```json
{
  "slug": "kebab-case",
  "term": "Display Title",
  "group": "<one of the 5 groups>",
  "summary": "One plain sentence.",
  "aliases": ["term a fan types", "..."],
  "body": ["Paragraph 1.", "Paragraph 2.", "..."],
  "whyItMatters": "1 to 2 sentences tying it to a race or our predictions.",
  "related": ["existing-or-earlier-slug", "..."],
  "badge": "drafted",
  "sources": [
    { "label": "Formula 1 official site", "url": "https://www.formula1.com/en/latest" },
    { "label": "Wikipedia: <page>", "url": "https://en.wikipedia.org/wiki/<Page>" }
  ]
}
```

Rules for every authored concept: product voice (see `drs`, `tyre-degradation` as exemplars); `body` 2 to 4 short paragraphs; **no em-dashes**; 2026-accurate; `badge: "drafted"`; `related` may only reference slugs that exist after your task (the original 8 plus anything added in an earlier task or this task's own batch); `aliases` must not collide with any existing alias. After appending, run `npx vitest run app/lib/concepts.consistency.test.ts` (must stay green) and `python3 -c "import json;json.load(open('app/data/concepts.json'))"` (valid JSON).

**Worked exemplar** (use this exact object as the pattern; it is one of the Task 3 concepts):

```json
{
  "slug": "tyre-compounds",
  "term": "Tyre Compounds",
  "group": "Tyres & strategy",
  "summary": "The range of dry tyres a team can pick from, and the trade of outright speed against how long they last.",
  "aliases": ["compound", "compounds", "tyre compound", "soft tyre", "medium tyre", "hard tyre"],
  "body": [
    "Pirelli brings a range of dry-weather tyres graded from the hardest to the softest. For each weekend it nominates three of them, and those become the soft, medium, and hard for that event. So the 'soft' at one track can be a different underlying rubber than the 'soft' at another.",
    "Softer tyres grip harder and set faster lap times, but they wear out sooner. Harder tyres give up some outright pace for a longer, steadier life. Choosing which to run, and for how long, is the heart of race strategy.",
    "Because the three chosen tyres differ track to track, the compound that ends up dominating a race is partly a function of what was brought that weekend."
  ],
  "whyItMatters": "The compound mix shapes how many stops a race needs and which tyre tends to dominate, which is exactly what our strategy and compound answers reason about.",
  "related": ["tyre-degradation", "stop-count-strategy"],
  "badge": "drafted",
  "sources": [
    { "label": "Formula 1 official site", "url": "https://www.formula1.com/en/latest" },
    { "label": "Wikipedia: Formula One tyres", "url": "https://en.wikipedia.org/wiki/Formula_One_tyres" }
  ]
}
```

---

### Task 3: Author "Tyres & strategy" (+3)

**Files:** Modify `app/data/concepts.json`.

Append three concepts, `group: "Tyres & strategy"`, `badge: "drafted"`:

- [ ] **Step 1: `tyre-compounds`** — use the worked exemplar above verbatim.
- [ ] **Step 2: `marbles`** — scope: bits of worn rubber flung off the racing line pile up off-line; going off-line (to defend, overtake, or at a restart) means less grip. aliases: `["marbles", "off-line grip"]`. related: `["tyre-degradation", "dirty-air"]`.
- [ ] **Step 3: `double-stacking`** — scope: pitting both cars on back-to-back laps in a single window, often under a safety car; the second car waits for the first, losing a little extra time, but both bank the stop. aliases: `["double stack", "double-stacking", "stacking"]`. related: `["stop-count-strategy", "pit-lane-time-loss", "undercut-overcut"]`.
- [ ] **Step 4: Validate + commit**

Run: `npx vitest run app/lib/concepts.consistency.test.ts && python3 -c "import json;json.load(open('app/data/concepts.json'))"`
Expected: PASS; valid JSON.

```bash
git add app/data/concepts.json
git commit -m "content: 3 Tyres & strategy explainers (compounds, marbles, double-stacking)"
```

---

### Task 4: Author "Pace & sessions" (+3) and "Air & aero" (+2)

**Files:** Modify `app/data/concepts.json`.

Append five concepts.

Pace & sessions (`group: "Pace & sessions"`):
- [ ] **Step 1: `fp-session-purpose`** — scope: what FP1, FP2, FP3 are each for (setup and system checks, long runs on heavier fuel, final quali prep); why FP2 long runs are the best public read on race pace. aliases: `["free practice", "FP1", "FP2", "FP3", "practice session"]`. related: `["qualifying-vs-race-pace", "sandbagging"]`.
- [ ] **Step 2: `sandbagging`** — scope: teams hiding true pace in practice (heavier fuel, engine turned down, not showing their best) so rivals cannot read them; why practice times can flatter or mislead. aliases: `["sandbagging", "hiding pace"]`. related: `["fp-session-purpose", "qualifying-vs-race-pace"]`.
- [ ] **Step 3: `sector-characteristics`** — scope: a lap splits into three timed sectors and a mix of low, medium, and high-speed corners; a car strong through fast corners may lose out in slow ones, so sector times reveal where its pace really comes from. aliases: `["sector", "sectors", "sector time", "corner speed"]`. related: `["qualifying-vs-race-pace", "track-evolution"]`.

Air & aero (`group: "Air & aero"`):
- [ ] **Step 4: `slipstream-tow`** — scope: sitting in the car ahead's wake cuts your drag on a straight, giving a speed boost (a "tow" or "slipstream"); the helpful flip side of dirty air, which hurts in the corners. aliases: `["slipstream", "tow", "the tow"]`. related: `["dirty-air", "drs"]`.
- [ ] **Step 5: `ground-effect`** — scope: the current cars make most of their downforce from shaped underfloor tunnels (ground effect, reintroduced in 2022); it lets cars follow a little more closely, and early on it caused bouncing known as porpoising. aliases: `["ground effect", "underfloor", "porpoising", "venturi"]`. related: `["dirty-air", "drs"]`.
- [ ] **Step 6: Validate + commit**

Run: `npx vitest run app/lib/concepts.consistency.test.ts && python3 -c "import json;json.load(open('app/data/concepts.json'))"`
Expected: PASS; valid JSON.

```bash
git add app/data/concepts.json
git commit -m "content: 5 Pace/Air explainers (fp purpose, sandbagging, sectors, tow, ground effect)"
```

---

### Task 5: Author the "Race control" group (+4, new group)

**Files:** Modify `app/data/concepts.json`.

Append four concepts, `group: "Race control"`, `badge: "drafted"`. (The `flag` emblem from Task 1 renders this group.)

- [ ] **Step 1: `safety-car-vsc`** — scope: a full Safety Car leads the field slowly and bunches everyone up; a Virtual Safety Car instead makes everyone hold a set slower pace. Both make a pit stop cheaper (the field is slow) and can reset a race's strategy. aliases: `["safety car", "virtual safety car", "VSC"]`. related: `["stop-count-strategy", "double-stacking", "flags"]`.
- [ ] **Step 2: `flags`** — scope: the flag and light-panel signals: yellow (caution, no overtaking) and double-yellow (greater danger), blue (let a faster, lapping car by), red (session stopped), and the chequered flag (finish). aliases: `["yellow flag", "double yellow", "blue flag", "red flag", "chequered flag", "checkered flag"]`. related: `["safety-car-vsc"]`.
- [ ] **Step 3: `grid-penalties`** — scope: a driver can start lower than they qualified, usually for taking too many new power-unit components over a season, a gearbox change, or an incident; penalties are grid-place drops or, when large, a pit-lane start. aliases: `["grid penalty", "grid drop", "pit lane start", "penalty"]`. related: `["qualifying-vs-race-pace"]`.
- [ ] **Step 4: `dnf-reliability`** — scope: "Did Not Finish" covers cars out through mechanical failure, a crash, or retirement; reliability is a real performance factor, and unfinished races are part of why any prediction carries uncertainty. aliases: `["DNF", "did not finish", "retirement", "reliability"]`. related: `["safety-car-vsc"]`.
- [ ] **Step 5: Validate + commit**

Run: `npx vitest run app/lib/concepts.consistency.test.ts && python3 -c "import json;json.load(open('app/data/concepts.json'))"`
Expected: PASS; valid JSON.

```bash
git add app/data/concepts.json
git commit -m "content: Race control group (safety car/VSC, flags, grid penalties, DNF)"
```

---

### Task 6: Author the "Power & energy" group (+4, new group) + lock final counts

**Files:** Modify `app/data/concepts.json`, `app/lib/concepts.consistency.test.ts`.

Append four concepts, `group: "Power & energy"`, `badge: "drafted"`. (The `battery` emblem from Task 1 renders this group.)

- [ ] **Step 1: `fuel-effect`** — scope: a car is heaviest at the start with a full fuel load and gets faster as it burns off (roughly a few hundredths of a second per lap per kilogram); so early-stint laps look slow, and comparing true pace means correcting for fuel. aliases: `["fuel effect", "fuel load", "fuel burn", "fuel correction"]`. related: `["qualifying-vs-race-pace", "tyre-degradation"]`.
- [ ] **Step 2: `lift-and-coast`** — scope: lifting off the throttle before the braking point to save the car. In 2026, with the big electrical share of the power unit, it is primarily an energy-management tool (banking battery charge), as well as saving fuel, tyres, and brakes; it costs a little lap time. Common shorthand: "lico". aliases: `["lift and coast", "lift-and-coast", "lico"]`. related: `["fuel-effect", "energy-harvesting"]`.
- [ ] **Step 3: `energy-harvesting`** — scope: under braking the car recovers energy into its battery (the MGU-K / ERS); with the 2026 power unit drawing close to half its output from electrical power, harvesting well over a lap is central to both attack and defence. aliases: `["harvesting", "energy recovery", "regen", "ERS", "MGU-K"]`. related: `["power-modes", "lift-and-coast"]`.
- [ ] **Step 4: `power-modes`** — scope: the 2026 driver-selectable energy deployment, including the manual override ("overtake") boost that hands extra electrical power to attack or defend, and how deployment is managed across a lap. Note it pairs with the aero "straight mode" covered under DRS & Active Aero. aliases: `["overtake mode", "boost mode", "override", "manual override"]`. related: `["energy-harvesting", "drs"]`. (Do NOT add "straight mode" as an alias here; it stays on `drs`.)
- [ ] **Step 5: Add back-references from existing concepts**

In `app/data/concepts.json`, add `"power-modes"` and `"energy-harvesting"` to the `related` array of the `drs` concept (so the aero/energy 2026 story cross-links both ways).

- [ ] **Step 6: Lock the final counts in the consistency test**

In `app/lib/concepts.consistency.test.ts`, add these tests inside the `describe`:

```ts
  it("ships all 24 concepts", () => {
    expect(concepts.length).toBe(24);
  });

  it("the original 8 are verified and the 16 new are drafted", () => {
    const verified = concepts.filter((c) => c.badge === "verified").length;
    const drafted = concepts.filter((c) => c.badge === "drafted").length;
    expect(verified).toBe(8);
    expect(drafted).toBe(16);
  });

  it("covers all five groups", () => {
    const groups = new Set(concepts.map((c) => c.group));
    expect(groups).toEqual(
      new Set(["Tyres & strategy", "Pace & sessions", "Air & aero", "Race control", "Power & energy"]),
    );
  });
```

- [ ] **Step 7: Validate + commit**

Run: `npx vitest run app/lib/concepts.consistency.test.ts && python3 -c "import json;json.load(open('app/data/concepts.json'))"`
Expected: PASS (all 24, badge split 8/16, five groups); valid JSON.

```bash
git add app/data/concepts.json app/lib/concepts.consistency.test.ts
git commit -m "content: Power & energy group (fuel, lico, harvesting, power modes) + lock 24-concept counts"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full JS suite**

Run: `npx vitest run`
Expected: all pass (consistency 24/8/16/5-groups, emblems, mocked accessor tests, everything else).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; clean build; `/learn` and `/learn/[slug]` still build (SSG).

- [ ] **Step 3: Manual check (local dev)**

Run `npm run dev`, visit `http://localhost:3000/learn`. Confirm:
  - Five group sections render, including **Race control** (chequered-flag emblem) and **Power & energy** (battery emblem).
  - 24 cards total; the 16 new ones show the **Drafted · unverified** badge, the original 8 show **Verified**.
  - Open 2 to 3 new concept pages (e.g. `/learn/power-modes`, `/learn/flags`): body, whyItMatters, related links, badge all render; related links navigate.
  - Optional: on the Ask page, a strategy answer whose narrative contains "safety car" linkifies to the safety-car-vsc popover.

- [ ] **Step 4: Commit any fixes** (if the manual check surfaced adjustments)

```bash
git add -A && git commit -m "fix: explainers-expansion polish from manual check"
```

---

## Self-Review

**Spec coverage:**
- 24 concepts / 5 groups / balance 7-5-4-4-4 → Tasks 3 (3) + 4 (5) + 5 (4) + 6 (4) = 16 new atop 8 = 24; groups asserted in Task 6.
- Two new emblems + `emblemForGroup` mappings, §8 flag note → Task 1.
- `drafted` badge for new, `verified` for existing → authoring standard + Task 6 badge-split test.
- Cross-linking via aliases/related, alias-collision rule, related-resolves → per-task `related`/`aliases` + Task 2 invariants + Task 6 back-references.
- No em-dashes, allowlisted sources, 2026-accurate voice → Global Constraints + Task 2 test.
- Generic accessors/`/learn`/TrustBadge/linkify untouched → no task modifies them; Task 7 confirms render.

**Placeholder scan:** the emblem SVGs and all test code are concrete; the exemplar concept is fully written; each other concept has a precise scope + concrete aliases + related. Body prose is the authoring deliverable (the acceptance test + scope + exemplar make it unambiguous), not a placeholder.

**Type/name consistency:** `EmblemKind`/`SvgEmblem` additions match the test and `emblemForGroup` strings; `ALLOWED_GROUPS` matches the `group` values authored; `related` targets are all slugs defined in this plan or the existing 8; new aliases checked pairwise for collisions with existing concept aliases (drs uses "active aero"/"overtake boost"; none reused here; "straight mode" deliberately kept on drs, not power-modes).
