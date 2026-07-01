# Stops + pit-loss full coverage (via NL) — design

> Spec. Give every completed 2026 race, plus the next one, an honest "how many pit
> stops" and "pit-lane time loss" answer through the ask interface. Date: 2026-07-01.
> Builds on branch `fix-2026-stopcount-data` (non-destructive live-season merge + rebuilt
> 2026 feature tables).

## Problem

A user asking "how many pit stops at <race>?" or "pit-lane time loss at <race>?" should get an
answer for every race that has happened this season and for the next one, at any point in time.
Today:
- **Stop count** only exists as a Model-B *prediction* from dry-FP2 long-run degradation, so only
  4 of the 8 completed 2026 rounds (Australia, Austria, Barcelona, Japan) can answer; sprint/wet
  rounds (China, Miami, Canada, Monaco) return nothing.
- **Pit-lane time loss** is already data-derived per circuit and covers all 9 completed 2026
  rounds + historical fallback for upcoming ones — largely working.

The gap is the **actual** stop count for completed races (what drivers actually did — always
knowable from race data, independent of FP), plus routing so one "stops" question resolves to the
right honest answer depending on race state.

## Decisions (locked with owner, 2026-07-01)

1. **Completed race → ACTUAL stops** (what drivers did, from race data), not the model prediction.
   Available for every completed round, accurate, honest. The Model-B prediction stays reserved
   for the upcoming race.
2. **Surface = the ask interface (NL), full coverage.** No new page. Any completed race or the
   next one must return stops + pit-loss on demand.
3. **Next race stops = historical norm, then sharpen.** Before dry practice (and for
   sprint/wet weekends that never get an FP2 long-run), show the circuit's historical modal stop
   count ("usually a 2-stop here"), clearly labeled as a historical expectation; upgrade to the
   Model-B telemetry prediction once dry FP long-run data exists.
4. Historical-race actuals (e.g. "stops at 2024 Monaco") fall out of the same table for free and
   are allowed, but are not a first-class goal.

## Architecture

One new **actual-stops** data source feeds three answer modes through the existing orchestrator;
pit-loss is already covered and only needs coverage verification.

### 1. Data — actual-stops table

- `src/features/actual_stops.py`: `race_stop_distribution(laps) -> {modal, counts, n_drivers, min, max}`
  computing the per-race stop-count distribution from race laps, reusing the validated
  `src.features.strategy.count_stops` (no FP, no dry filter — works for every completed race
  including sprint/wet).
- `src/pipeline.py`: `build_actual_stops(seasons, circuits) -> pd.DataFrame` — one row per
  `(race_id, year, gp)` with `modal_stops`, `n_drivers`, `stops_min`, `stops_max`, and a compact
  distribution (e.g. `n_1stop`, `n_2stop`, `n_3stop`). Loads each race session; skips a race with
  no laps (unrun/future) so the builder is safe to run over the whole calendar.
- Persisted via `src.store` as `actual_stops.parquet`; bundled to `api/` alongside the others.
- Built across 2023–2026 for the 2026 season circuits + Great Britain (next). The 2023–25 rows
  double as the **per-circuit historical norm** used for upcoming-race fallback.
- Wired into `scripts/build_2026.py` (a new numbered step) and `build_all()`, using the
  non-destructive `merge_refreshed` (so it refreshes each weekend without wiping prior rounds).

### 2. Inference — actual + norm lookups

- `src/inference/lookup.py` (or a sibling): `actual_stops(year, gp, table)` → the completed race's
  distribution; `historical_stop_norm(gp, table, before_year)` → the leakage-safe modal stop count
  across strictly-prior seasons at that circuit (for the upcoming-race fallback). Numbers rounded
  at the boundary per the house rule.
- Reads ONLY the bundled parquet (never fastf1), like the other inference callables.

### 3. Routing — one "stops" question, three honest modes

- Parser unchanged: a stops question still yields the `predict_strategy` intent + `{gp, year}`.
- `app/lib/orchestrate.ts` (`predict_strategy` branch) decides by race state, checked against the
  bundled data:
  - **Completed** (an actual-stops row exists for `(year, gp)`) → **actual** mode.
  - **Upcoming, no dry-FP row** → **historical norm** mode (prior-year modal at the circuit).
  - **Upcoming, dry-FP row exists** → existing **Model-B prediction** mode (`predict_stop_counts`).
- The Python side exposes the actual/norm reads via a serverless fn (extend `api/strategy.py` or
  `api/inference.py`; whichever keeps the function under the size limit and the fastf1-free
  guard). Race-state detection uses the presence of an actual-stops row as the completion signal.
- `generateStrategyNarrative` gains grounded copy for the actual and historical-norm modes
  ("At the 2026 Austrian GP most drivers ran 2 stops — 14 of 20, range 1–3"), still under the
  "do not invent facts" constraint. No em-dashes (existing rule).
- `StrategyCard` gains a `mode: "actual" | "historical" | "predicted"` label so the UI states
  plainly which it is showing; the SC caveat stays on the predicted mode only.

### 4. Pit-loss coverage

Already data-derived, year-aware, with historical fallback for the next race. Scope here is
verification, not rebuild: confirm every completed 2026 round AND Great Britain return a number
via NL, and close any circuit-name normalization gap (`app/lib/circuits.ts` /
`normalizeLookupCircuit`) so a stat question never silently returns "not available" for a race we
have data for.

### 5. Staying current

Extend `RACE_CALENDAR[2026]` (`src/calendar.py`) to the full real 2026 schedule so `build_2026.py`
(R17) fetches each round's actuals + pit-loss as it runs; unrun rounds fail gracefully (already
handled — `load_session` returns None for a future race). `weekend-schedule.json` keeps rolling
the "next race" forward on the ops cadence (already works — `nextRace()` resolves Great Britain
now). This is what makes the coverage hold "at any given point in time" through the season.

## Testing

Repo pattern (node-only vitest for TS pure logic; pytest for Python; browser/preview for the
serverless hop):
- pytest: `race_stop_distribution` over a fixture of laps (modal, counts, min/max); `build_actual_stops`
  skips unrun races; `historical_stop_norm` is leakage-safe (strictly-prior seasons only) and matches
  a hand-checked circuit; `actual_stops` reads the bundled table.
- vitest: orchestrator routing picks actual vs historical vs predicted from race state fixtures;
  circuit normalization covers the 2026 rounds + Great Britain.
- Data: rebuild `data/` + refresh the `api/` bundle (incl. new `actual_stops.parquet`), commit like
  the merge fix. Confirm predict-strategy answers for a completed round (actual), Monaco/China
  (actual, previously blank), and the next race (historical norm).
- Anchor: nb06 +0.070 must still reproduce (this feature does not touch Model B training).

## Out of scope / non-goals

- No new page or season table (owner chose the NL surface).
- No change to the Model-B prediction itself, its training, or the +0.070 result.
- No driver-by-driver strategy timeline; the answer is race-level (modal + distribution) with the
  SC caveat only on the predicted mode. New ideas → PRD §12, not v1.
- Not a betting/odds surface; stops are descriptive (actual) or honestly-caveated (norm/predicted).

## Dependency

Sits on `fix-2026-stopcount-data` (non-destructive merge + rebuilt 2026 tables). That branch must
land first (or this work continues on it); the actual-stops build reuses `merge_refreshed` and the
rebuilt tables.
