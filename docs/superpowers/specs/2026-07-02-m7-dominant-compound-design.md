# M7 (slice 2) — Wire the dominant-compound query type

**Status:** design approved 2026-07-02, ready for planning.
**Milestone:** M7 (breadth + polish). Second of M7's independent sub-projects (after the
`/accuracy` calibration curve). Remaining M7 slices after this: explainers 8→15, visual
polish, optional championship projection.

## 1. Purpose

Answer "what tyre compound is usually dominant here?" end to end. The `predict_compound`
intent is already parsed but dead-ends in `orchestrate` (no branch, no card), so the query
currently falls through to "unsupported." This slice wires it through to a grounded answer
with a color-coded ASCII tyre glyph.

**Honesty framing (locked by CLAUDE / PRD §5.1):** dominant compound has **no telemetry
edge** (Phase 1: 0.733 = 0.733 vs track-norm). So it runs on the **historical "typical
compound here"** norm and MUST be presented honestly as a *historical pattern, not a
telemetry prediction* — like the podium baseline, unlike the validated stop-count edge. The
answer always carries the **Pirelli-allocation caveat**: the actual dominant compound depends
on which C1-C5 tyres are brought this weekend, which we do not model in v1 (owner decision:
historical norm + caveat, no allocation input).

## 2. Data & inference — `src/inference/strategy.py`

The pipeline already computes `dominant_compound` per race (the dry compound SOFT/MEDIUM/HARD
that took the most race laps) in `strategy_features.parquet`, which is already bundled to
`api/`. No pipeline or table changes.

New fastf1-free function (same module as `predict_stop_counts`, reads the same table):

```python
def dominant_compound_norm(year: int, gp: str, table: pd.DataFrame | None = None) -> dict:
    ...
```

- Filters `table` to `gp == gp AND year < year` (leakage-safe: strictly-prior years only,
  matching the existing leakage guards).
- Returns the **mode** of `dominant_compound` over those prior years plus honesty metadata:

  ```
  { "year": year, "gp": gp,
    "compound": "MEDIUM" | "SOFT" | "HARD" | None,
    "n_years": int,        # how many prior runnings had a dominant compound
    "share": float | None, # fraction of prior runnings that had the modal compound, rounded
    "considered": [2023, 2024, 2025] }  # the prior years counted
  ```

- No prior history (or no dry `dominant_compound` in prior years) → `compound: None`,
  `n_years: 0`, `share: None`, `considered: []` (honest "not enough history here").
- Round `share` here (house rule: round every number that reaches output).
- Ties: `pandas` mode returns the alphabetically-first on a tie; pick a deterministic rule
  (mode's first value) and note it. Share still reflects that compound's count.

**Tests** (`tests/`): mode over prior years only (a later-year row never leaks into an
earlier target); share/n_years correct; empty/sparse → `None` shape; single prior year; a
tie resolves deterministically.

## 3. API wiring — `api/strategy.py` (no new lambda, no new parquet)

`api/strategy.py` already loads `strategy_features.parquet` into `_TABLE` and serves
stop-count via `strategy_response(body)`. Add a `kind` discriminator on the request body:

- `kind` absent / `"stops"` → existing `strategy_response` (unchanged default).
- `kind == "compound"` → new `compound_response(body)` that validates `year`/`gp` (same 400s
  as `strategy_response`) and returns `200, dominant_compound_norm(year, gp, table=_TABLE)`.

The `handler.do_POST` dispatches on `kind`. One new branch, reuses the bundled table; no
`vercel.json` / includeFiles change.

## 4. Frontend

### 4.1 orchestrate.ts + parser.ts
- `predict_compound` intent already exists in `parser.ts`; confirm its tool description
  captures `gp` + optional `year` (tighten the description if needed — no new intent).
- Add a `predict_compound` branch in `orchestrate.ts`: normalize the circuit via the existing
  strategy circuit normalization (same roster/aliases as `predict_strategy`), `postJson` to
  `/api/strategy` with `{ kind: "compound", year, gp }`, and assemble a `CompoundAnswer` added
  to the `Answer` union (with the compound + honesty metadata + generated narrative).
- Sparse/unknown circuit → the honest low-data state (compound `None`), never an error.

### 4.2 narrative.ts — `generateCompoundNarrative`
Grounded, honest, no invented facts, no em-dashes. Must:
- Frame the answer as the **historical/typical** compound here (explicitly NOT a telemetry
  prediction), citing the share ("usually MEDIUM here, 2 of the last 3 runnings").
- Always include the **Pirelli-allocation caveat** (actual call depends on this weekend's tyre
  allocation).
- Degrade gracefully when `compound: None` (honest "not enough history for this circuit").
- Follow the existing `*_SYSTEM` prompt conventions (allowlisted context only, "do not invent
  facts", never free LLM recall).

### 4.3 CompoundCard.tsx — the ASCII tyre glyph
A compact answer card leading with a **compound-colored ASCII tyre glyph**:
- Reuse `AsciiEmblem kind="tyre"` (the existing side-on tyre → ASCII/dither pipeline). Extend
  `AsciiEmblem` with an **optional `color` prop** threaded into `emblemSvgMarkup(kind, color)`;
  it **defaults to the current brand blue** so every existing caller is unchanged.
- Tint by compound (color-coding only, **NO Pirelli marks / branding**, per PRD §8):
  SOFT = red, MEDIUM = amber, HARD = light grey. A small `compoundColor(compound)` map (new,
  e.g. `app/lib/compound.ts`) is the single source; HARD uses a mid/light grey (pure white is
  invisible on the `#FAFAFA` bg).
- Overlay a crisp **S / M / H** letter, contrast-guarded against the tyre color via the
  existing `app/lib/contrast.ts` (same technique as the helmet numbers).
- Below the glyph: the grounded narrative + the honest "X of the last N runnings" share.
- `compound: None` → the glyph is omitted (or a neutral placeholder) and the card shows only
  the honest "not enough history" copy.
- Reduced-motion respected (AsciiEmblem already gates its reveal); theme tokens only.

## 5. Non-goals (this slice)

- No Pirelli allocation input (owner: historical norm + caveat only).
- No ML / no telemetry compound model (Phase 1: no edge). Historical norm only.
- No per-driver or start-tyre compound prediction (that is a §12 fast-follow).
- No changes to the pipeline, `strategy_features.parquet` schema, the cron, or R17.
- No new serverless lambda or new bundled table.

## 6. Testing & verification

- Python unit tests for `dominant_compound_norm` (§2) — leakage, share/n_years, sparse, tie.
- `compound_response` request/validation covered (extend the strategy api test if present, or
  add one): missing year/gp → 400; valid → the norm shape; `kind` default still stop-count.
- Frontend: `npm run build` + `tsc` clean; existing pytest + vitest suites stay green.
- Manual/preview: "what tyre is usually dominant at Monza?" (or similar) flows
  NL → parser → `/api/strategy` (kind compound) → grounded narrative → CompoundCard with the
  colored tyre glyph; a no-history circuit returns the honest low-data state; the existing
  stop-count strategy query is unaffected.

## 7. Files

- **New:** `src/inference/strategy.py` gains `dominant_compound_norm` (+ tests);
  `app/lib/compound.ts` (compound→color map + S/M/H letter); `app/components/CompoundCard.tsx`.
- **Edited:** `api/strategy.py` (kind discriminator + `compound_response`); `app/components/
  AsciiEmblem.tsx` + `app/lib/emblems.ts` (optional `color` prop threaded through — default
  unchanged); `app/lib/orchestrate.ts` (branch + `Answer` union + `CompoundAnswer`);
  `app/lib/narrative.ts` (`generateCompoundNarrative`); `app/api/ask/route.ts` (dispatch, if
  the route enumerates intents); `app/page.tsx` (render `CompoundCard`); possibly
  `app/lib/parser.ts` (tighten the `predict_compound` tool description).
- **Untouched:** the Python pipeline, `strategy_features.parquet` schema, the cron, R17,
  `vercel.json`.
