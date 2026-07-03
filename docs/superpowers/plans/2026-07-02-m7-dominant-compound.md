# M7 Dominant-Compound Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-parsed `predict_compound` intent end to end — NL → parser → `/api/strategy` (compound branch) → grounded narrative → a `CompoundCard` with a compound-colored ASCII tyre glyph.

**Architecture:** A fastf1-free inference function reads the leakage-safe `hist_dominant` column from the already-bundled strategy table (no ML, no pipeline change). `api/strategy.py` gains a `kind: "compound"` branch reusing the loaded table. The frontend adds a narrative, an orchestrate branch, a compound-color map, an optional `color` prop on the existing `AsciiEmblem`, and a `CompoundCard`.

**Tech Stack:** Python (pandas), Next.js App Router + TypeScript, Vitest, pytest.

## Global Constraints

- **Historical norm, NOT a telemetry prediction** — dominant compound has no telemetry edge (Phase 1: 0.733 = 0.733). Present it honestly as the historical/typical compound; every narrative carries the **Pirelli-allocation caveat**.
- **No em-dashes** in any user-facing copy or narrative prompt.
- **Round every number that reaches output** — this slice surfaces no computed floats (only `year`/`basis_year` ints), so there is nothing to round; keep it that way.
- **Leakage guard:** the compound value must never come from the target year's own race. Use `hist_dominant` (strictly-prior-years mode) only; never read a `year >= target` row for the value.
- **No changes** to the Python pipeline, `strategy_features.parquet` schema, the cron, R17, or `vercel.json`. No new serverless lambda, no new bundled table.
- **v1 uses `hist_dominant` only** — no share/count figure. Reduced-motion + theme tokens respected on the card; color-coding only on the tyre (no Pirelli marks, PRD §8).

---

### Task 1: `dominant_compound_norm` inference (Python)

**Files:**
- Modify: `src/inference/strategy.py`
- Test: `tests/test_inference_strategy.py`

**Interfaces:**
- Consumes: `store.read_table`, `store.STRATEGY_TABLE` (already imported in the module).
- Produces: `dominant_compound_norm(year: int, gp: str, table: pd.DataFrame | None = None) -> dict` returning `{"year": int, "gp": str, "compound": "SOFT"|"MEDIUM"|"HARD"|None, "basis_year": int|None}`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_inference_strategy.py`:

```python
import pandas as pd
from src.inference.strategy import dominant_compound_norm


def _compound_table(rows):
    """rows: list of (year, gp, hist_dominant). Two driver rows per running to exercise dedup."""
    recs = []
    for y, gp, hd in rows:
        for drv in ("AAA", "BBB"):
            recs.append({"year": y, "gp": gp, "hist_dominant": hd, "Driver": drv, "n_stops": 1})
    return pd.DataFrame(recs)


def test_compound_norm_uses_exact_year_row():
    t = _compound_table([(2024, "Italy", "MEDIUM")])
    out = dominant_compound_norm(2024, "Italy", table=t)
    assert out == {"year": 2024, "gp": "Italy", "compound": "MEDIUM", "basis_year": 2024}


def test_compound_norm_upcoming_falls_back_to_latest_prior_running():
    t = _compound_table([(2024, "Italy", "SOFT"), (2025, "Italy", "HARD")])
    out = dominant_compound_norm(2026, "Italy", table=t)
    assert out["compound"] == "HARD"
    assert out["basis_year"] == 2025


def test_compound_norm_skips_null_hist_dominant():
    t = _compound_table([(2023, "Italy", None), (2024, "Italy", "MEDIUM")])
    out = dominant_compound_norm(2026, "Italy", table=t)
    assert out["compound"] == "MEDIUM"
    assert out["basis_year"] == 2024


def test_compound_norm_no_history_returns_none():
    t = _compound_table([(2024, "Italy", "MEDIUM")])
    out = dominant_compound_norm(2026, "Baku", table=t)
    assert out == {"year": 2026, "gp": "Baku", "compound": None, "basis_year": None}


def test_compound_norm_never_reads_future_year_for_value():
    # target 2024 must use the 2024 row (SOFT), never peek at 2025 (HARD).
    t = _compound_table([(2024, "Italy", "SOFT"), (2025, "Italy", "HARD")])
    out = dominant_compound_norm(2024, "Italy", table=t)
    assert out["compound"] == "SOFT"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_strategy.py -k compound_norm -q`
Expected: FAIL — `dominant_compound_norm` not defined (ImportError).

- [ ] **Step 3: Implement the function**

Append to `src/inference/strategy.py`:

```python
def dominant_compound_norm(year: int, gp: str, table: pd.DataFrame | None = None) -> dict:
    """Historical 'typical compound here' from the leakage-safe hist_dominant column.

    Dominant compound has NO telemetry edge (Phase 1: 0.733 = 0.733), so this is a historical
    NORM, not a prediction. Reads ONLY the persisted strategy table's `hist_dominant` (the mode
    of the circuit's dominant dry compound over strictly-earlier years) — never the target
    year's own compound. For an upcoming race (no row for `year`) it falls back to the latest
    prior running's hist_dominant, which lags the most recent running by one year.
    """
    table = table if table is not None else store.read_table(store.STRATEGY_TABLE)
    rows = (
        table[table["gp"] == gp][["year", "hist_dominant"]]
        .drop_duplicates()
        .dropna(subset=["hist_dominant"])
    )
    none_result = {"year": year, "gp": gp, "compound": None, "basis_year": None}
    if rows.empty:
        return none_result
    exact = rows[rows["year"] == year]
    if not exact.empty:
        chosen = exact.iloc[0]
    else:
        prior = rows[rows["year"] < year]
        if prior.empty:
            return none_result
        chosen = prior.sort_values("year").iloc[-1]
    return {
        "year": year,
        "gp": gp,
        "compound": str(chosen["hist_dominant"]),
        "basis_year": int(chosen["year"]),
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_strategy.py -k compound_norm -q`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/inference/strategy.py tests/test_inference_strategy.py
git commit -m "feat: dominant_compound_norm historical lookup (no telemetry, hist_dominant)"
```

---

### Task 2: `compound_response` + `kind` routing (Python API)

**Files:**
- Modify: `api/strategy.py`
- Test: `tests/test_api_strategy.py`

**Interfaces:**
- Consumes: `dominant_compound_norm` (Task 1); the module-level `_TABLE`.
- Produces: `compound_response(body: dict) -> tuple[int, dict]` and `route(body: dict) -> tuple[int, dict]` (dispatches `kind == "compound"` → compound, else stop-count). `handler.do_POST` calls `route`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_api_strategy.py`:

```python
from api.strategy import compound_response, route


def test_compound_response_requires_year_and_gp():
    assert compound_response({"gp": "Italy"})[0] == 400
    assert compound_response({"year": 2026})[0] == 400


def test_compound_response_rejects_non_integer_year():
    assert compound_response({"year": "soon", "gp": "Italy"})[0] == 400


def test_compound_response_returns_norm_shape():
    status, payload = compound_response({"year": 2026, "gp": "Italy"})
    assert status == 200
    assert payload["gp"] == "Italy"
    assert "compound" in payload  # SOFT/MEDIUM/HARD or None from the bundled table


def test_route_dispatches_compound_vs_stops():
    comp = route({"kind": "compound", "year": 2026, "gp": "Italy"})[1]
    assert "compound" in comp and "drivers" not in comp
    stops = route({"year": 2026, "gp": "Italy"})[1]
    assert "dominant" in stops  # stop-count shape, unchanged default
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_api_strategy.py -k "compound or route" -q`
Expected: FAIL — `compound_response` / `route` not importable.

- [ ] **Step 3: Implement the branch**

In `api/strategy.py`, extend the strategy import and add the two functions. Change the import line:

```python
from src.inference.strategy import predict_stop_counts, dominant_compound_norm  # noqa: E402
```

Add after `strategy_response` (before `class handler`):

```python
def compound_response(body: dict) -> tuple[int, dict]:
    """Historical 'typical compound here' (no telemetry edge; a NORM, not a prediction)."""
    year, gp = body.get("year"), body.get("gp")
    if year is None or not gp:
        return 400, {"error": "year and gp are required"}
    try:
        year = int(year)
    except (TypeError, ValueError):
        return 400, {"error": "year must be an integer"}
    return 200, dominant_compound_norm(year, gp, table=_TABLE)


def route(body: dict) -> tuple[int, dict]:
    """Dispatch by `kind`: compound norm vs the default stop-count response."""
    if body.get("kind") == "compound":
        return compound_response(body)
    return strategy_response(body)
```

Then in `handler.do_POST`, replace the `strategy_response(body)` call with `route(body)`:

```python
        else:
            status, payload = route(body)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_api_strategy.py -q`
Expected: PASS (new + existing strategy api tests).

- [ ] **Step 5: Commit**

```bash
git add api/strategy.py tests/test_api_strategy.py
git commit -m "feat: /api/strategy compound branch via kind discriminator"
```

---

### Task 3: Compound narrative (TypeScript)

**Files:**
- Modify: `app/lib/narrative.ts`
- Test: `app/lib/narrative.test.ts` (create if absent; else extend)

**Interfaces:**
- Consumes: `LlmClient`, `HAIKU` (already in `narrative.ts`).
- Produces: `export type CompoundFacts`; `export function compoundLede(f: CompoundFacts): string`; `export async function generateCompoundNarrative(client: LlmClient, facts: CompoundFacts): Promise<string>`.

- [ ] **Step 1: Write the failing test**

Create (or extend) `app/lib/narrative.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compoundLede, type CompoundFacts } from "./narrative";

const base: CompoundFacts = { year: 2026, gp: "Italy", compound: "MEDIUM", basis_year: 2025 };

describe("compoundLede", () => {
  it("names the historical dominant compound in lower case", () => {
    const s = compoundLede(base);
    expect(s).toContain("Italy");
    expect(s).toContain("medium");
    expect(s).not.toContain("—"); // no em-dash
  });

  it("degrades honestly when there is no history", () => {
    const s = compoundLede({ ...base, compound: null, basis_year: null });
    expect(s.toLowerCase()).toContain("enough history");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/narrative.test.ts`
Expected: FAIL — `compoundLede` not exported.

- [ ] **Step 3: Implement the type, lede, and generator**

Append to `app/lib/narrative.ts`:

```ts
export type CompoundFacts = {
  year: number;
  gp: string;
  compound: "SOFT" | "MEDIUM" | "HARD" | null;
  basis_year: number | null;
  context?: string[];
};

// Grounded one-liner the generator leads with. No invented facts; no em-dashes.
export function compoundLede(f: CompoundFacts): string {
  if (!f.compound) {
    return `There isn't enough history to call a typical tyre compound at the ${f.gp} yet.`;
  }
  const name = f.compound.toLowerCase();
  return `Historically the dominant tyre at the ${f.gp} has been the ${name} compound.`;
}

const COMPOUND_SYSTEM = [
  "You write a short, honest explanation (2-3 sentences) about which tyre compound is TYPICALLY dominant at a Formula 1 circuit.",
  "You may use ONLY the facts in the JSON the user provides (the lede line, the compound, and any `context`).",
  "The first line of the user message is a grounded lede; build naturally from it rather than repeating it verbatim.",
  "This is a HISTORICAL pattern (the compound that took the most race laps here in past years), NOT a telemetry prediction. Never present it as a forecast of this weekend.",
  "You MUST note that the actual dominant compound depends on this weekend's Pirelli tyre allocation, which this historical view does not account for.",
  "If the JSON includes `context` (curated circuit facts), you MAY add at most ONE short detail from it, only from that array, never your own outside knowledge.",
  "Do not invent drivers, teams, numbers, causes, or comparisons not in the JSON.",
  "If compound is null (a low-data state), say plainly there isn't enough history for this circuit yet.",
  "Write in plain prose: never use em-dashes. Use commas, colons, or separate sentences instead.",
].join(" ");

export async function generateCompoundNarrative(
  client: LlmClient,
  facts: CompoundFacts,
): Promise<string> {
  const lede = compoundLede(facts);
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 200,
    system: COMPOUND_SYSTEM,
    messages: [{ role: "user", content: `${lede}\n\n${JSON.stringify(facts)}` }],
  });
  return msg.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/narrative.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/narrative.ts app/lib/narrative.test.ts
git commit -m "feat: grounded compound narrative + CompoundFacts type"
```

---

### Task 4: Compound colors, AsciiEmblem color prop, CompoundCard

**Files:**
- Create: `app/lib/compound.ts`
- Test: `app/lib/compound.test.ts`
- Modify: `app/components/AsciiEmblem.tsx`
- Create: `app/components/CompoundCard.tsx`

**Interfaces:**
- Consumes: `AsciiEmblem` (extended), `contrastGuard`/`INK` from `app/lib/contrast.ts`, `CompoundFacts` from `app/lib/narrative.ts`.
- Produces: `COMPOUND_COLOR`, `COMPOUND_LETTER`, type `Compound` from `app/lib/compound.ts`; `AsciiEmblem` gains optional `color?: string`; `export function CompoundCard({ compound, narrative })`.

- [ ] **Step 1: Write the failing test**

Create `app/lib/compound.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { COMPOUND_COLOR, COMPOUND_LETTER } from "./compound";

describe("compound maps", () => {
  it("has a hex color and a single letter for each dry compound", () => {
    for (const c of ["SOFT", "MEDIUM", "HARD"] as const) {
      expect(COMPOUND_COLOR[c]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(COMPOUND_LETTER[c]).toBe(c[0]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/compound.test.ts`
Expected: FAIL — cannot resolve `./compound`.

- [ ] **Step 3: Implement `compound.ts`**

Create `app/lib/compound.ts`:

```ts
// Compound color-coding for the tyre glyph (PRD §8: color coding + compound letter only,
// NO Pirelli marks). HARD uses a light grey, not white, so it reads on the near-white bg.
export type Compound = "SOFT" | "MEDIUM" | "HARD";

export const COMPOUND_COLOR: Record<Compound, string> = {
  SOFT: "#DA2A47", // red
  MEDIUM: "#E6A93A", // amber
  HARD: "#B9BAC6", // light grey
};

export const COMPOUND_LETTER: Record<Compound, string> = {
  SOFT: "S",
  MEDIUM: "M",
  HARD: "H",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/compound.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread an optional `color` prop through `AsciiEmblem`**

In `app/components/AsciiEmblem.tsx`, add `color` to the props (destructure + type) and pass it to `emblemSvgMarkup`, and add it to the build effect's deps. The prop is optional and defaults to `undefined`, so `emblemSvgMarkup(kind, undefined)` keeps its own default color — existing callers are unchanged.

Change the signature block:

```tsx
export function AsciiEmblem({
  kind,
  size = 120,
  cols = 28,
  animate = true,
  className = "",
  color,
}: {
  kind: EmblemKind;
  size?: number;
  cols?: number;
  animate?: boolean;
  className?: string;
  color?: string;
}) {
```

Change the SVG url line inside the build effect:

```tsx
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(emblemSvgMarkup(kind, color))}`;
```

Change that effect's dependency array to include `color` (it currently ends `}, [kind, cols]);`):

```tsx
  }, [kind, cols, color]);
```

- [ ] **Step 6: Implement `CompoundCard`**

Create `app/components/CompoundCard.tsx`:

```tsx
"use client";

import { AsciiEmblem } from "@/app/components/AsciiEmblem";
import { COMPOUND_COLOR, COMPOUND_LETTER } from "@/app/lib/compound";
import { contrastGuard, INK } from "@/app/lib/contrast";
import type { CompoundFacts } from "@/app/lib/narrative";

// The dominant-compound answer: a compound-colored ASCII tyre glyph (color-coding only, no
// Pirelli marks per PRD §8) with a contrast-guarded S/M/H letter, plus the grounded,
// historical-framing narrative. No glyph when there is no history.
export function CompoundCard({
  compound,
  narrative,
}: {
  compound: CompoundFacts;
  narrative: string;
}) {
  const c = compound.compound;
  const color = c ? COMPOUND_COLOR[c] : null;
  return (
    <div className="fog-in flex max-w-xl flex-col items-center gap-4 px-4 py-2 text-center">
      {c && color ? (
        <div className="relative h-28 w-28">
          <AsciiEmblem kind="tyre" color={color} size={112} cols={30} className="h-28 w-28" />
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center font-grotesk text-3xl font-bold"
            style={{ color: contrastGuard(INK, color) }}
            aria-hidden="true"
          >
            {COMPOUND_LETTER[c]}
          </span>
        </div>
      ) : null}
      <p className="font-lastik text-lg text-ink">{narrative}</p>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/lib/compound.ts app/lib/compound.test.ts app/components/AsciiEmblem.tsx app/components/CompoundCard.tsx
git commit -m "feat: compound color map, AsciiEmblem color prop, CompoundCard tyre glyph"
```

---

### Task 5: Wire `predict_compound` end to end (orchestrate + route + page + parser)

**Files:**
- Modify: `app/lib/orchestrate.ts`
- Modify: `app/api/ask/route.ts`
- Modify: `app/page.tsx`
- Modify: `app/lib/parser.ts`

**Interfaces:**
- Consumes: `CompoundFacts` + `generateCompoundNarrative` (Task 3); `CompoundCard` (Task 4); the `/api/strategy` compound branch (Task 2).
- Produces: `AnswerDeps` gains `predictCompound` + `narrateCompound`; the `Answer` union gains a `compound` variant; a `predict_compound` branch in `answerQuery`; the ask route wires the deps; `page.tsx` renders `CompoundCard`.

- [ ] **Step 1: Extend `orchestrate.ts`**

Add `CompoundFacts` to the narrative import (top of file, in the existing `from "./narrative"` type import group), then:

Add to the `AnswerDeps` type (after the `narrateStrategy` line):

```ts
  predictCompound: (year: number, gp: string) => Promise<CompoundFacts>;
  narrateCompound: (facts: CompoundFacts) => Promise<string>;
```

Add to the `Answer` union (after the `strategy` variant):

```ts
  | { supported: true; compound: CompoundFacts; narrative: string }
```

Add the branch in `answerQuery`, immediately after the `predict_strategy` block:

```ts
  if (parsed.intent === "predict_compound") {
    const target = resolveTarget(parsed, upcoming);
    if (!target) return { supported: false, message: unsupportedSlice(parsed.gp ?? "") };
    const compound = withContext(await deps.predictCompound(target.year, target.gp), target.gp);
    const narrative = await deps.narrateCompound(compound);
    return { supported: true, compound, narrative };
  }
```

- [ ] **Step 2: Wire the deps in `app/api/ask/route.ts`**

Add `generateCompoundNarrative` and `type CompoundFacts` to the imports from `@/app/lib/narrative`, then add these two deps inside the `answerQuery({ ... })` object (alongside `predictStrategy`/`narrateStrategy`):

```ts
        predictCompound: (year, gp) =>
          postJson<CompoundFacts>(origin, "/api/strategy", { kind: "compound", year, gp }),
        narrateCompound: (facts) => generateCompoundNarrative(client, facts),
```

- [ ] **Step 3: Render `CompoundCard` in `app/page.tsx`**

Add the imports near the other card/type imports:

```tsx
import { CompoundCard } from "@/app/components/CompoundCard";
```
and add `type CompoundFacts` to the existing type import from `@/app/lib/narrative`.

Add the render branch alongside the other `"key" in answer` blocks (after the `strategy` one):

```tsx
          {answer && "supported" in answer && answer.supported && "compound" in answer && (
            <CompoundCard compound={answer.compound} narrative={answer.narrative} />
          )}
```

- [ ] **Step 4: Tighten the `predict_compound` parser description**

In `app/lib/parser.ts`, ensure the `predict_compound` intent is clearly described so the model routes "what tyre is usually dominant / typical compound here" to it (and keeps `gp` + optional `year` extraction). If the tool has a per-intent description list, add/adjust the `predict_compound` line to: "predict_compound: which tyre compound is typically dominant at a circuit (historical)." Do not add new entities; `gp`/`year` already exist.

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; clean build.

- [ ] **Step 6: Commit**

```bash
git add app/lib/orchestrate.ts app/api/ask/route.ts app/page.tsx app/lib/parser.ts
git commit -m "feat: wire predict_compound end to end (orchestrate, route, page, parser)"
```

---

### Task 6: Full-suite verification + manual check

**Files:** none (verification only).

- [ ] **Step 1: Full Python suite**

Run: `PYTHONPATH=. .venv/bin/python -m pytest -q`
Expected: all pass (including the new compound tests).

- [ ] **Step 2: Full JS suite + build**

Run: `npx vitest run && npm run build`
Expected: all vitest pass; clean build.

- [ ] **Step 3: Confirm no forbidden changes**

Run: `git diff --name-only main -- src/pipeline.py 'api/*.parquet' vercel.json src/features/strategy.py`
Expected: no output (no pipeline / bundled-table / vercel / feature-schema changes).

- [ ] **Step 4: Manual check (local dev)**

Run `npm run dev`. With the dev server up, POST a compound query to confirm the Python branch and routing resolve (the LLM parser/narrative need `ANTHROPIC_API_KEY`; if absent locally, at least verify the API branch directly):

```bash
curl -s -X POST http://localhost:3000/api/strategy \
  -H 'Content-Type: application/json' \
  -d '{"kind":"compound","year":2026,"gp":"Italy"}'
```
Expected: `200` with `{"year":2026,"gp":"Italy","compound":"...","basis_year":...}` (compound may be a dry compound or `null` depending on bundled history). Confirm a plain `{"year":2026,"gp":"Italy"}` (no `kind`) still returns the stop-count shape. Full NL → CompoundCard (with the colored tyre glyph + S/M/H letter) verifies on the Vercel preview before merge (needs the Haiku key + real bundle).

- [ ] **Step 5: Commit any fixes** (if the manual check surfaced adjustments)

```bash
git add -A && git commit -m "fix: dominant-compound polish from manual check"
```

---

## Self-Review

**Spec coverage:**
- §2 inference (`hist_dominant`, leakage-safe, upcoming fallback, `None` shape) → Task 1.
- §3 API `kind` branch (no new lambda/table) → Task 2.
- §4.1 orchestrate branch + parser → Task 5; §4.2 `generateCompoundNarrative` (historical framing + allocation caveat, degrade on null, no em-dash) → Task 3; §4.3 CompoundCard + AsciiEmblem `color` prop + compound color map + contrast-guarded letter → Task 4.
- §5 non-goals (no pipeline/schema/cron/R17/vercel/new-table changes; no share) → Global Constraints + Task 6 Step 3.
- §6 testing → Tasks 1-4 (unit) + Task 6 (suites + manual).

**Placeholder scan:** none — every step has concrete code or an exact command.

**Type consistency:** `CompoundFacts` shape (`year`/`gp`/`compound`/`basis_year`/`context?`) matches across narrative.ts (Task 3), orchestrate/route/page (Task 5), and CompoundCard (Task 4). `dominant_compound_norm` return keys match `CompoundFacts` (minus `context`, added by `withContext`). `compound_response`/`route` names match the api test (Task 2) and the `do_POST` call. `COMPOUND_COLOR`/`COMPOUND_LETTER`/`Compound` names match compound.ts, its test, and CompoundCard. `AsciiEmblem` `color?` prop matches CompoundCard's usage.
