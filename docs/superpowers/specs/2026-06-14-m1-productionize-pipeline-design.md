# M1 — Productionize the Phase 1 Pipeline (Design Spec)

> Date: 2026-06-14 · Status: approved for planning · Milestone: PRD §11 **M1**
> Prereqs read: `handoff.md`, `CLAUDE.md`, `sector4-prd.md` §5.1/§7.2/§11.

## 1. Goal & Definition of Done

Turn the validated Phase 1 data/ML logic into **callable, cached, leakage-safe
production code** — the code that will later live behind the Vercel Python `/api/`
path. PRD §11 M1 DoD: *"the Phase 1 data/feature pipeline runs as callable, cached,
leakage-safe production code."*

**M1 ships a callable core Python library only.** No Next.js, no HTTP/serverless
wiring, no LLM, no UI. Those are M2+. M1's job is to make the validated pipeline and
the validated capabilities importable, with a clean interface M2 can consume.

## 2. Scope (locked)

| Decision | Choice |
|---|---|
| M1 boundary | **Callable core library only** — no Next.js, no `/api/` HTTP wiring. |
| Train / data layer | **Cached feature table (parquet) + train-on-call** on strictly-prior weekends. |
| M1 callable surface | Batch feature-pipeline build + `lookup_stat` + pace-gap inference (Model A) + stop-count strategy inference (Model B, SC-caveated). |
| Structural approach | **B — evolve `src/` in place** into the production package. |

**In scope:** feature-store layer, unified batch build, `inference/` package for the
three validated capabilities, moving Model B strategy-table assembly out of notebook
`06` into `src/`, extended tests.

**Out of scope (deferred, with clean extension points — no lying stubs):**
- Podium-probability assembly + calibration → **M3**.
- Dominant-compound baseline → its own milestone.
- Deriving pit-loss/abrasiveness from data (PRD §7.2) → flagged follow-up; M1 keeps
  curated track dicts.
- Any frontend, HTTP handler, LLM parser/narrator, or app scaffolding → **M2+**.

## 3. Why Approach B

Evolve `src/` in place rather than starting a parallel package (A) or a thin facade
(C). B consolidates the one genuine gap — Model B's strategy-table assembly currently
exists **only** inside `notebooks/06_strategy_compound.py`, violating "logic lives in
`src/`." It reuses the validated low-level feature code, centralizes the leakage guard
that caused Phase 1's worst bug, keeps the existing 51 tests green while extending
them, and gives M2 a single import surface (`from src.inference import ...`). A
duplicates code and lets `src/` rot; C leaves Model B ad-hoc and fails the DoD.

## 4. Module Layout

```
src/
  data/        load.py, results.py                  (keep as-is)
  features/    stints.py, pace.py, track.py,        (keep low-level fns)
               friday.py, qualisim.py,
               strategy.py   ← GAINS per-driver/per-race strategy-table assembly
                               (the build_tables/add_history logic now in nb 06)
  calendar.py  (NEW)  canonical dry circuit set + calendar ordering helper
  pipeline.py  (NEW)  batch build → persists Model A + Model B feature tables
  store.py     (NEW)  feature-store parquet I/O + leakage-safe slicing chokepoint
  inference/   (NEW package)
    __init__.py     re-exports the three public callables
    lookup.py       lookup_stat(stat, gp)        — pit-loss, tyre deg, stint length (no ML)
    pace.py         predict_pace_gaps(year, gp)  — Model A: per-driver delta + uncertainty
    strategy.py     predict_stop_counts(year,gp) — Model B: per-driver stops + SC caveat
```

Notebooks `02`–`06` keep importing from `src/` and keep running; `06` is refactored to
call the new `src/features/strategy.py` assembly instead of its inline copy (no behavior
change — same numbers).

## 5. Key Design Principle — Inference Never Imports fastf1

Two clearly separated layers:

- **Batch build** (`pipeline.py`) — the *only* layer that touches fastf1 and the ~225M
  `cache/`. It loads sessions, runs the FP long-run pipeline (PRD §7.2: stint detection
  → lap filtering → fuel correction → compound normalization → track-evolution
  correction), and writes small parquet feature tables to the data dir.
- **Inference** (`inference/*`) — reads **only** the persisted parquet table. It loads
  the table, fits the cheap RF/logistic on strictly-prior weekends, predicts the target.
  It imports **no fastf1**.

Consequence: the eventual `/api/` serverless functions ship only the small feature
table, never fastf1 or the multi-hundred-MB cache. This is what makes "callable
production code" actually serveable in M2, and it keeps cold starts viable.

## 6. The Leakage Guard, Centralized

One chokepoint function in `store.py`:

```
prior_weekends(table, year, gp) -> DataFrame
```

Returns only rows from races **strictly before** the target weekend in **calendar
order** — never alphabetical (the exact silent look-ahead bug from Phase 1, see
`handoff.md` §2). Calendar order comes from `src/calendar.py`, not from sorting
`race_id` strings. Every inference path trains through this function, so per-caller
leakage cannot reappear. Train-on-call over the returned prior weekends reproduces the
validated rolling-origin protocol exactly (train races 1..N, predict N+1).

Leakage invariants preserved from Phase 1:
- Nothing race-derived for the target race is ever an input feature for that race.
- Standings / form / track-history features come from strictly prior races.
- FP features come from the target weekend's own practice sessions only.

## 7. Output Contracts (typed, rounded)

Each inference function returns a typed result (dataclass serialized to dict). **Every
number is rounded at the boundary** (house rule — float artifacts must not leak).

- **`predict_pace_gaps(year, gp)`** → per driver: `pace_delta_s` (compound-/fuel-/
  evolution-corrected predicted race-pace delta vs field, lower = faster),
  `uncertainty_s` (std across the RandomForest trees — an honest band), plus
  `n_train_races`. Model A is the demoted, *supporting* capability: gaps + uncertainty,
  **not** a podium ranking.
- **`predict_stop_counts(year, gp)`** → per driver: `n_stops`, `confidence`
  (`predict_proba` of the chosen class), and an explicit **`sc_caveat`** field stating
  the +0.07 edge is measured on a dry / safety-car-clean backtest and live accuracy will
  be lower. This is the validated telemetry edge and the deg→stops explainer hook.
- **`lookup_stat(stat, gp)`** → `value`, `units`, `source` — pit-lane time loss and
  tyre deg / stint length surfaced from already-computed pipeline / track values. No ML.

**Sparse-prior handling:** when too few prior weekends exist to train honestly (e.g.
early season, first visit to a circuit), inference returns a **qualitative band**, not
false numeric precision. Threshold mirrors the Phase 1 `min_train_races` discipline.

## 8. Caching

- `cache/` (fastf1) — unchanged, used only by the batch build; gitignored.
- Feature-store parquet tables — written by the batch build to the data dir, read by
  inference; gitignored (treated as a build artifact, regenerable from cache).
- `enable_cache()` idempotency and dir-creation behavior from `src/data/load.py` are
  preserved.

## 9. Testing

Extend the existing pytest suite; **synthetic frames only, no fastf1 in unit tests**
(matches current test style). The existing 51 tests stay green. New coverage:

- **Leakage slice:** `prior_weekends` never returns a race on/after the target, and
  respects calendar (not alphabetical) order — includes a regression case with a
  December race that must not leak into a March prediction.
- **Pipeline build shape:** batch build produces the expected columns/row grain for
  both the Model A and Model B tables from synthetic sessions/fixtures.
- **Inference contracts:** each function returns the typed shape, numbers are rounded,
  training used only prior weekends, sparse-prior returns a qualitative band.
- **Lookup values:** `lookup_stat` returns correct computed values + units + source.
- **Notebook-parity guard for Model B:** the migrated `src/features/strategy.py`
  assembly produces the same table the inline notebook code did (protect the validated
  +0.07 result).

## 10. Known Gaps (flagged, not fixed in M1)

- Track features remain curated dicts in `src/features/track.py`; deriving pit-loss /
  abrasiveness from data (PRD §7.2) is a follow-up.
- Podium probabilities + calibration = **M3**; dominant compound = its own milestone.
- M1 leaves clean extension points for both — no stubs that return fake values.

## 11. Definition of Done (checklist)

- [ ] `pipeline.py` batch-build persists Model A + Model B feature tables from the cache.
- [ ] `store.py` provides parquet I/O and the `prior_weekends` leakage chokepoint.
- [ ] Model B strategy-table assembly lives in `src/features/strategy.py`; nb `06`
      calls it (same numbers).
- [ ] `inference/` exposes `lookup_stat`, `predict_pace_gaps`, `predict_stop_counts`
      with typed, rounded outputs and SC-caveat / uncertainty fields.
- [ ] Inference imports no fastf1; trains only on strictly-prior weekends.
- [ ] New tests pass; existing 51 tests still pass.
