# /weekend Visual Upgrade + CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `/weekend` text list into a designed podium-odds table with ASCII helmet glyphs + curated circuit fun-facts, and add a home-page CTA that routes to it.

**Architecture:** Pure frontend polish on the shipped M5 surface. Extract shared bits (band colours, a driver-name lookup) so the home page and `/weekend` agree; add a curated facts JSON + helper; rebuild the `/weekend` server component to render a styled `<table>` with the existing `AsciiGlyph`; add a CTA `Link` on `app/page.tsx`. No prediction/snapshot/cron/Blob changes.

**Tech Stack:** Next.js App Router + TypeScript, React, Tailwind (existing classes), `AsciiGlyph` (existing canvas glyph), vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-m5-weekend-visual-upgrade-design.md`.

## Global Constraints

- **Honesty:** bands are the surface; keep the calibration note; `p≈` stays a secondary figure (as on the home page). Fun facts are **hand-authored/verified only — never LLM-invented**.
- **Visual system (PRD §8):** abstract glyphs only (helmet + number + 3-letter code); no photos/faces/logos/liveries. Driver hard facts (name, number, colour) come from `app/data/drivers.json` / `teams.json` — never inline literals.
- **Motion** gated behind `prefers-reduced-motion`.
- **Reuse** `AsciiGlyph` (`app/components/AsciiGlyph.tsx`, props `{ code, team, size?, cols? }`, `team: string | null`); it degrades to the `DriverGlyph` SVG fallback.
- `/weekend` stays a **server component** reading the latest Blob snapshot; the empty-state (no snapshot) is unchanged.
- **Commits:** conventional, one logical change each, **no AI/Claude attribution**.

---

### Task 1: Shared band colours + driver-name lookup

**Files:**
- Create: `app/lib/bands.ts`
- Create: `app/lib/bands.test.ts`
- Modify: `app/lib/glyph.ts` (add `driverName`)
- Modify: `app/lib/glyph.test.ts` (add a `driverName` test)
- Modify: `app/page.tsx:16-20` (import `BAND_TEXT` instead of the local const)

**Interfaces:**
- Produces: `BAND_TEXT: Record<string, string>` (band label → Tailwind text-colour class) in `app/lib/bands.ts`; `driverName(code: string): string` in `app/lib/glyph.ts` (full name from `drivers.json`, or the code itself if unknown).

- [ ] **Step 1: Write the failing tests**

```typescript
// app/lib/bands.test.ts
import { describe, it, expect } from "vitest";
import { BAND_TEXT } from "./bands";

describe("BAND_TEXT", () => {
  it("covers all three bands with text-colour classes", () => {
    for (const band of ["strong", "in contention", "outside shot"]) {
      expect(BAND_TEXT[band]).toMatch(/^text-/);
    }
  });
});
```

```typescript
// app/lib/glyph.test.ts  (add)
import { driverName } from "./glyph";

it("resolves a known driver code to a full name", () => {
  expect(driverName("VER")).toBe("Max Verstappen");
});
it("falls back to the code for an unknown driver", () => {
  expect(driverName("ZZZ")).toBe("ZZZ");
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run app/lib/bands.test.ts app/lib/glyph.test.ts`
Expected: FAIL — `./bands` missing; `driverName` not exported.

- [ ] **Step 3: Create `app/lib/bands.ts`**

```typescript
// Podium band → text-colour class. Shared by the home page and /weekend so the two
// surfaces use one definition. (M5 visual upgrade)
export const BAND_TEXT: Record<string, string> = {
  strong: "text-emerald-600",
  "in contention": "text-amber-600",
  "outside shot": "text-slate-400",
};
```

- [ ] **Step 4: Add `driverName` to `app/lib/glyph.ts`**

Append (the file already imports `drivers` and declares the `Driver` type):

```typescript
/** Full driver name for a 3-letter code, or the code itself if unknown. Pure. */
export function driverName(code: string): string {
  return (drivers as Record<string, Driver>)[code]?.name ?? code;
}
```

- [ ] **Step 5: Point `app/page.tsx` at the shared `BAND_TEXT`**

Delete the local `const BAND_TEXT … };` block at `app/page.tsx:16-20` and add to the imports at the top of the file:

```typescript
import { BAND_TEXT } from "@/app/lib/bands";
```

- [ ] **Step 6: Run the tests + typecheck**

Run: `npx vitest run app/lib/bands.test.ts app/lib/glyph.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add app/lib/bands.ts app/lib/bands.test.ts app/lib/glyph.ts app/lib/glyph.test.ts app/page.tsx
git commit -m "refactor: share BAND_TEXT + add driverName lookup"
```

### Task 2: Curated circuit fun-facts

**Files:**
- Create: `app/data/circuit-facts.json`
- Create: `app/lib/circuit-facts.ts`
- Create: `app/lib/circuit-facts.test.ts`

**Interfaces:**
- Produces: `getCircuitFacts(gp: string): string[]` — verified curated facts for a canonical gp key, or `[]` if none.

- [ ] **Step 1: Write the failing test**

```typescript
// app/lib/circuit-facts.test.ts
import { describe, it, expect } from "vitest";
import { getCircuitFacts } from "./circuit-facts";

describe("getCircuitFacts", () => {
  it("returns curated facts for a seeded circuit", () => {
    const facts = getCircuitFacts("Austria");
    expect(facts.length).toBeGreaterThanOrEqual(3);
    expect(typeof facts[0]).toBe("string");
  });
  it("returns an empty array for a circuit with no curated facts", () => {
    expect(getCircuitFacts("Narnia")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run app/lib/circuit-facts.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `app/data/circuit-facts.json`** (hand-authored, verified, evergreen)

```json
{
  "Austria": [
    "The Red Bull Ring is one of the shortest laps on the calendar at about 4.3 km, so a full lap takes a little over a minute.",
    "It sits roughly 660 m above sea level in the Styrian mountains — the thinner air slightly trims engine and aero performance.",
    "With only 10 corners and three long straights, it's a power-and-traction circuit where braking zones bunch the field for overtakes.",
    "The track was originally the A1-Ring, itself a shortened version of the old Österreichring, and returned to the calendar in 2014."
  ],
  "Great Britain": [
    "Silverstone was built on a former WWII airfield and hosted the very first round of the Formula 1 World Championship in 1950.",
    "At about 5.9 km it is a fast, flowing lap — the Maggotts–Becketts–Chapel complex is one of the highest-speed corner sequences in F1.",
    "The British round regularly draws one of the largest race-day crowds of the season.",
    "High-energy corners make it tough on front-left tyre wear, which feeds into strategy calls."
  ]
}
```

- [ ] **Step 4: Create `app/lib/circuit-facts.ts`**

```typescript
// Curated, hand-authored, verified circuit facts (M5 stopgap). NOT LLM-generated — the
// PRD forbids invented facts. M6's learning layer replaces this file with the dynamic
// entity-what pipeline (allowlist -> Haiku paraphrase -> cite + link -> cache -> badge).
import facts from "@/app/data/circuit-facts.json";

export function getCircuitFacts(gp: string): string[] {
  return (facts as Record<string, string[]>)[gp] ?? [];
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run app/lib/circuit-facts.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/data/circuit-facts.json app/lib/circuit-facts.ts app/lib/circuit-facts.test.ts
git commit -m "feat: curated circuit fun-facts (stopgap until M6 learning layer)"
```

### Task 3: Redesign `/weekend` — podium table + glyphs + facts

**Files:**
- Modify: `app/weekend/page.tsx` (full rewrite of the render; data-fetch logic unchanged)

**Interfaces:**
- Consumes: `getJson` + `latestKey` + `WeekendSnapshot` (existing), `AsciiGlyph` (`app/components/AsciiGlyph.tsx`), `BAND_TEXT` (Task 1), `driverName` (Task 1), `getCircuitFacts` (Task 2).

- [ ] **Step 1: Rewrite `app/weekend/page.tsx`**

```tsx
// The issued artifact (M5): this weekend's frozen predictions, read from the latest Blob
// snapshot — NOT live per-request, so testers see exactly what was frozen at the
// checkpoint. Static server render (no client motion). Fun facts are a curated stopgap;
// M6 replaces them with the dynamic entity-what pipeline.
import schedule from "@/app/data/weekend-schedule.json";
import { getJson } from "@/app/lib/blob";
import { latestKey, type WeekendSnapshot } from "@/app/lib/snapshot";
import { AsciiGlyph } from "@/app/components/AsciiGlyph";
import { BAND_TEXT } from "@/app/lib/bands";
import { driverName } from "@/app/lib/glyph";
import { getCircuitFacts } from "@/app/lib/circuit-facts";

export const dynamic = "force-dynamic";

const CHECKPOINT_LABEL: Record<string, string> = {
  "pre-quali": "Issued Friday — pre-qualifying",
  "post-quali": "Sharpened Saturday — post-qualifying",
  final: "Final — race complete",
};

type PodiumDriver = {
  rank?: number;
  driver: string;
  team?: string | null;
  band?: string;
  p_podium?: number;
};
type Podium = { mode?: string; drivers?: PodiumDriver[]; reason?: string };
type Strategy = { dominant?: { n_stops: number; share: number } | null; sc_caveat?: string };
type Pace = { drivers?: { driver: string; pace_delta_s: number }[] };

const SHELL = "mx-auto max-w-3xl px-6 py-12";

export default async function WeekendPage() {
  const snap = await getJson<WeekendSnapshot>(latestKey(schedule.year, schedule.gp));

  if (!snap) {
    return (
      <main className={`legible ${SHELL}`}>
        <h1 className="font-bebas text-5xl tracking-wide">
          {schedule.gp} Grand Prix {schedule.year}
        </h1>
        <p className="mt-4 text-muted">
          No prediction issued yet — check back after Friday practice.
        </p>
      </main>
    );
  }

  const podium = (snap.podium ?? {}) as Podium;
  const strategy = (snap.strategy ?? {}) as Strategy;
  const pace = (snap.pace ?? {}) as Pace;
  const facts = getCircuitFacts(snap.gp);
  const drivers = podium.drivers ?? [];

  return (
    <main className={`legible ${SHELL}`}>
      <header className="mb-8">
        <h1 className="font-bebas text-5xl tracking-wide">
          {snap.gp} Grand Prix {snap.year}
        </h1>
        <p className="mt-1 font-grotesk text-sm text-muted">
          {CHECKPOINT_LABEL[snap.checkpoint] ?? snap.checkpoint} ·{" "}
          {new Date(snap.issuedAt).toUTCString()}
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-4 font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted">
          Podium odds{podium.mode ? ` · ${podium.mode}` : ""}
        </h2>
        {drivers.length > 0 ? (
          <table className="w-full border-collapse font-grotesk text-sm">
            <thead>
              <tr className="border-b border-ink/15 text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium"></th>
                <th className="py-2 pr-3 font-medium">Driver</th>
                <th className="py-2 pr-3 font-medium">Team</th>
                <th className="py-2 pr-3 font-medium">Chance</th>
                <th className="py-2 text-right font-medium">p≈</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d, i) => (
                <tr key={d.driver} className={i % 2 ? "bg-ink/[0.03]" : ""}>
                  <td className="py-2 pr-2 align-middle font-mono text-muted">{d.rank ?? i + 1}</td>
                  <td className="py-1 pr-2 align-middle">
                    <AsciiGlyph code={d.driver} team={d.team ?? null} size={48} />
                  </td>
                  <td className="py-2 pr-3 align-middle">
                    <span className="font-bold tracking-wide">{d.driver}</span>{" "}
                    <span className="text-muted">{driverName(d.driver)}</span>
                  </td>
                  <td className="py-2 pr-3 align-middle text-muted">{d.team ?? ""}</td>
                  <td
                    className={`py-2 pr-3 align-middle font-semibold uppercase tracking-wide ${
                      BAND_TEXT[d.band ?? "outside shot"] ?? BAND_TEXT["outside shot"]
                    }`}
                  >
                    {d.band}
                  </td>
                  <td className="py-2 text-right align-middle font-mono text-muted">
                    {typeof d.p_podium === "number" ? d.p_podium : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">{podium.reason ?? "Not enough data yet."}</p>
        )}
      </section>

      {strategy.dominant && (
        <section className="mb-10">
          <h2 className="mb-3 font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            Strategy
          </h2>
          <p>
            Likely a {strategy.dominant.n_stops}-stop race (
            {Math.round(strategy.dominant.share * 100)}% of the field).
          </p>
          {strategy.sc_caveat && <p className="mt-1 text-sm text-muted">{strategy.sc_caveat}</p>}
        </section>
      )}

      {pace.drivers && pace.drivers.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            Long-run pace <span className="normal-case text-muted">(supporting context, not a result)</span>
          </h2>
          <ol className="font-grotesk text-sm">
            {pace.drivers.slice(0, 6).map((d) => (
              <li key={d.driver} className="py-0.5">
                <span className="font-bold tracking-wide">{d.driver}</span>{" "}
                <span className="text-muted">{d.pace_delta_s}s</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {facts.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            About {snap.gp}
          </h2>
          <ul className="space-y-2 font-lastik text-sm leading-relaxed">
            {facts.map((f) => (
              <li key={f} className="border-l-2 border-ink/15 pl-3">{f}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted">{snap.calibrationNote}</p>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; `/weekend` route compiles.

- [ ] **Step 3: Run the full vitest suite (no regressions)**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add app/weekend/page.tsx
git commit -m "feat: /weekend podium-odds table with glyphs + curated facts"
```

### Task 4: Home-page CTA → `/weekend`

**Files:**
- Modify: `app/page.tsx` (add a top-right CTA `Link`)

**Interfaces:**
- Consumes: `next/link`.

- [ ] **Step 1: Add the import**

At the top of `app/page.tsx` (with the other imports):

```typescript
import Link from "next/link";
```

- [ ] **Step 2: Add the CTA element**

The home page renders a fixed top-left wordmark (a `<span class="fixed left-6 top-5 …">SECTOR4</span>` lives in the root layout). Add a mirrored top-right CTA as the first child inside the page's top-level returned element (the outer `<main>`/fragment in `Home`). Insert:

```tsx
<Link
  href="/weekend"
  className="fixed right-6 top-5 z-20 font-grotesk text-xs font-semibold uppercase tracking-wide text-ink/70 underline-offset-4 transition-colors duration-200 hover:text-ink hover:underline motion-reduce:transition-none"
>
  Upcoming weekend odds →
</Link>
```

> Place it as the first element inside `Home`'s returned top-level container so it overlays consistently. If `Home` returns a fragment, add it right after the opening `<>`.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; the home route still compiles and lists `/weekend` as a route.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: home-page CTA linking to /weekend odds"
```

### Task 5: Handoff note + final verification

**Files:**
- Modify: `handoff.md` (§6 — fun-facts → M6 note)

- [ ] **Step 1: Add the M6 note to `handoff.md`**

Under the M5 §6 "REMAINING" list, add:

```markdown
- **Fun facts are a curated hand-authored stopgap** (`app/data/circuit-facts.json` +
  `app/lib/circuit-facts.ts`, shown on `/weekend`). **M6's learning layer must replace them**
  with the entity-what pipeline: allowlist source → Haiku original paraphrase → inline
  citation + link → cache (per-type TTL) → auto "drafted, unverified" badge + corrections
  form; hard facts from `drivers.json`. Until then, add facts by hand per weekend.
```

- [ ] **Step 2: Full verification**

Run: `npx vitest run && PYTHONPATH=. .venv/bin/python -m pytest -q && npx tsc --noEmit && npm run build`
Expected: all green (existing 144 pytest + the new vitest tests), tsc clean, build clean.

- [ ] **Step 3: Commit**

```bash
git add handoff.md
git commit -m "docs: note M6 should replace curated /weekend facts with entity-what pipeline"
```

## Final verification (before merge / live check)

- [ ] `npx vitest run` — all pass (incl. `bands`, `circuit-facts`, `driverName`).
- [ ] `PYTHONPATH=. .venv/bin/python -m pytest -q` — still 144 pass.
- [ ] `npx tsc --noEmit` + `npm run build` — clean; `/weekend` + `/` compile.
- [ ] **Live preview:** `/weekend` shows the podium **table** with helmet glyphs + the "About Austria" facts; home page shows the top-right **CTA** linking to `/weekend`. (Requires a snapshot in Blob — the real one lands at the weekend, or re-run the force-test; otherwise `/weekend` shows the empty-state, which is also correct.)

## Notes for the executor

- The project has **no `.tsx` render harness** (vitest env is node) — components are verified by `tsc` + `npm run build` + live preview, not unit render tests. Only the pure helpers (`bands`, `circuit-facts`, `driverName`) get unit tests.
- Do **not** touch prediction/snapshot/cron/Blob code — this is presentation only.
- `AsciiGlyph` is a client component used inside server pages already (home page pattern); no `"use client"` needed on `/weekend`.
