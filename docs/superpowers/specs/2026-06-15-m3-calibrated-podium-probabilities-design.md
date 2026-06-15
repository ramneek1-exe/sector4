# M3 — Calibrated Podium Probabilities, Backend (Design Spec)

> Date: 2026-06-15 · Status: approved for planning · Milestone: PRD §11 **M3** (backend slice)
> Prereqs read: `handoff.md`, `CLAUDE.md`, `sector4-prd.md` §5.1/§6.2/§6.4/§7.2/§11, `notebooks/QUALISIM_PODIUM_RESULTS.md`.
> Builds on: M1 (`src/inference/*`, fastf1-free callable surface; `store.prior_weekends` leakage chokepoint) and the Phase 1 podium spike (`notebooks/05_podium_classifier.py`).

## 1. Goal & Definition of Done

Ship the **backend** of Sector 4's headline feature: an honest, calibration-ready
**podium-probability callable** that runs on the validated public signals
(championship standings + recent form + prior-year track pace, + actual grid as
available) and **sharpens Friday → Saturday**. The product surface is **qualitative
bands** ("strong / in contention / outside shot"), not precise percentages —
because Phase 1 (§5.1) showed the probabilities are overconfident on the small
sample. The numeric `p_podium` is still computed and returned (flagged
uncalibrated) so the %-upgrade is pre-wired.

**Scope decision (owner):** M3 is split. This spec is the **backend callable only**.
The PRD §11 M3 "done when" also names the glyph rendering / visible-uncertainty UI —
that is an explicit **follow-up spec**, not this one (see §9).

**Definition of Done (this slice):**
- A new fastf1-free callable `predict_podium(year, gp, mode="auto")` lives in
  `src/inference/podium.py`, registered on the public inference surface.
- A persisted `data/podium_features.parquet` table is built by a batch
  `build_podium_table` in `src/pipeline.py` (the only fastf1 layer).
- A **regression test reproduces notebook 05's held-out numbers** from the
  persisted table (Friday top-3 ≈ 0.711, Saturday ≈ 0.733, with Brier) — the trust
  anchor that the production port is faithful.
- Output is qualitative bands; `p_podium` + `calibrated: false` + `n_train_races`
  are returned; sparse prior (`n_train < 8`) → honest low-confidence state.
- All M1 invariants hold: inference never imports fastf1; training only through
  `store.prior_weekends`; every number rounded at the boundary; logic in `src/`.

## 2. Scope (locked)

| Decision | Choice |
|---|---|
| Slice | **Backend callable only.** Glyphs / `drivers.json` / band UI / reveal / `/api` route / narrative → follow-up spec. |
| Target data | **Historical 2023–25 only.** No live-2026 ingestion (deferred to M5). Predicts any weekend present in the table; pinned to notebook 05 numbers by a regression test. |
| Circuit set | The **validated 8-circuit dry set** (Bahrain, Saudi Arabia, Spain, Hungary, Italy, Mexico City, Las Vegas, Abu Dhabi), 2023–25 — identical to the spike, so the regression test is exact. |
| Probability surface | **Qualitative bands now, calibration-ready.** `p_podium` returned but `calibrated: false`; numeric % stays off. |
| Overconfidence fix | **Drop `class_weight="balanced"`** in `podium_model.py` (the documented 0.86→0.49 cause). No isotonic/Platt machinery yet (sample too small; §5). |
| Feature set | `BASE = [champ_rank_before, champ_points_before, form_finish_avg3]`, `+ prior_track_pace` always; **Saturday** adds `grid_position`. (Quali-sim grid & constructor standings were Phase-1-cut — excluded.) |
| Mode | `predict_podium(..., mode="auto")`: Saturday feature set when the target's grid is present, else Friday. Explicit `"friday"`/`"saturday"` override allowed. |
| Min training | `MIN_TRAIN_RACES = 8` (the validated rolling-origin floor; below → qualitative low-confidence, no proba). |

## 3. Architecture & Flow (mirrors M1)

```
BATCH (fastf1, offline)                INFERENCE (fastf1-free, per call)
─────────────────────                  ────────────────────────────────
src/pipeline.py                        src/inference/podium.py
  build_podium_table()                   predict_podium(year, gp, mode)
   ├─ load race results (grid,            ├─ read PODIUM_TABLE (parquet)
   │   finish, points, team)              ├─ target rows for (year, gp)
   ├─ add_friday_features()               ├─ prior = store.prior_weekends(...)  ← leakage chokepoint
   ├─ prior_track_pace() (join PACE_TABLE)│   (calendar order, never alphabetical)
   └─ store.write_table(PODIUM_TABLE)     ├─ pick feature cols by mode
                                          ├─ fit logistic on prior; predict_proba target
   data/podium_features.parquet  ───────► ├─ band_for(p) per driver, round
                                          └─ ranked dict (bands + flagged p_podium)
```

Same contract as `predict_pace_gaps` / `predict_stop_counts`: batch writes a small
parquet table; the callable reads only that table and trains the cheap model at
call time on strictly-prior weekends.

## 4. New feature table — `data/podium_features.parquet` (`store.PODIUM_TABLE`)

Add `PODIUM_TABLE = "data/podium_features.parquet"` to `src/store.py`. Per-driver-
per-weekend rows over the 8-circuit × 3-season set. Columns:

| Column | Source | Role |
|---|---|---|
| `race_id`, `year`, `gp`, `Driver`, `team` | calendar + race results | keys |
| `champ_points_before`, `champ_rank_before` | `friday.add_friday_features` | feature (BASE) |
| `form_finish_avg3` | `friday.add_friday_features` (impute 10.5) | feature (BASE) |
| `prior_track_pace` | `friday.prior_track_pace` (new fn; impute 0.0) | feature |
| `grid_position` | race results (pre-race input — legal) | feature (Saturday only) |
| `finish_pos` | race results | **label source only** — never a feature |
| `podium` | `(finish_pos <= 3)` | target label |

`build_podium_table` in `src/pipeline.py` (fastf1, batch only): loads race results
per (year, gp) for grid/finish/points/team, calls `add_friday_features`, joins
`PACE_TABLE` for `prior_track_pace`, computes the `podium` label, persists via
`store.write_table`. Mirrors `build_strategy_table`'s structure.

**Leakage guards (explicit):** `finish_pos` is the label only and is never in any
feature list. `grid_position` is the actual pre-race grid — a legal known input for
the race it belongs to (training rows use their own grid, the target uses its own).
`prior_track_pace` uses strictly *prior years* at the circuit. `champ_*` / `form_*`
use `before_date`. The target weekend is excluded from training by
`store.prior_weekends`, not by any in-table trick.

## 5. Probability handling — bands now, % later (the maturity gate)

**Why bands, not %:** Phase 1 (§5.1, nb 05) — the high band predicted 0.86 vs an
actual 0.49 podium rate. `class_weight="balanced"` on ~22 weekends is the cause;
we drop it. Even so, ~22 weekends is too few to *fit* a calibrator
(`CalibratedClassifierCV` isotonic/Platt) without overfitting, so we deliberately
**do not build that machinery now**. We return the raw `p_podium` with
`calibrated: false` so the interface already carries the number.

**The %-upgrade is gated on measured calibration, not on a date or "M5 arrived".**
Recorded here so M5 inherits the contract rather than re-deciding it — flipping
numeric % on requires **both**:
1. **Enough data to fit a calibrator** (isotonic/Platt in the rolling-origin loop) —
   more than the historical sample provides; accumulates as 2026 unfolds.
2. **A passing calibration check** — the public week-over-week reliability/Brier
   curve (PRD §6.4) showing a band delivers near its stated rate on held-out 2026
   weekends.

Early 2026 is the worst case (sparse **and** a regulation reset), so % almost
certainly stays off at the first real weekend; the transition is **gradual and
per-band** (a "strong" band may earn a % before "in contention" does), driven by
the curve. If 2026 calibration never tightens, **staying on bands is the correct,
honest outcome** — bands are the default, % is an earned upgrade.

## 6. Band scheme (REVIEW — confirm thresholds/labels)

Anchored to nb 05's *observed* held-out podium rates so a band means something
empirically, rather than echoing the overconfident raw %:

| Band | `p_podium` | Observed podium rate (nb 05 Friday) | Meaning |
|---|---|---|---|
| `strong` | ≥ 0.50 | ≈ 0.49 | strong chance relative to the field |
| `in contention` | 0.20 – 0.50 | ≈ 0.14 | a real but minority chance |
| `outside shot` | < 0.20 | ≈ 0.00 | longshot; ranked but not expected |

`band_for(p)` lives in `src/models/podium_model.py` (unit-tested at the
boundaries). Labels describe **chance relative to the field, never certainty** —
the predicted podium is the top 3 by `p_podium`. **Owner: confirm or adjust the
three labels and the 0.20 / 0.50 thresholds.** (PRD §6.2 wording is "strong /
likely / outside shot"; this spec proposes "in contention" for the middle band as
more honest at ~14% — flag if you prefer "likely".)

## 7. Callable contract — `predict_podium(year, gp, mode="auto", table=None)`

Return shape (parallels `pace.py`; numbers rounded at the boundary):

```json
{ "year": 2025, "gp": "Italy", "mode": "saturday",
  "qualitative": true, "calibrated": false, "n_train_races": 14,
  "drivers": [
    {"driver": "VER", "band": "strong",        "p_podium": 0.71, "rank": 1},
    {"driver": "NOR", "band": "in contention",  "p_podium": 0.34, "rank": 2}
  ] }
```

- **Empty target** (no rows for `year, gp`): `{... "qualitative": true,
  "reason": "no feature row for target weekend", "drivers": []}` — matches `pace.py`.
- **Sparse prior** (`n_train < MIN_TRAIN_RACES`): `{... "qualitative": true,
  "n_train_races": n, "reason": "too few prior weekends for a calibrated podium",
  "drivers": []}` — no proba, no fake precision.
- **Mode auto:** Saturday feature set iff the target rows have a non-null
  `grid_position`, else Friday. `drivers` sorted by `p_podium` descending.
- Registered **lazily** in `src/inference/__init__.py` (sklearn path, like
  pace/strategy — not the lookup-only lambda). Add `"predict_podium"` to `__all__`
  and the `__getattr__` dispatch.

Feature-column names are declared **in the inference module** (not imported from
`src.features.assemble`, which imports fastf1) — same fastf1-isolation pattern as
`pace.py`'s `FP_FEATURE_COLS`.

## 8. Model change — `src/models/podium_model.py`

- **Drop `class_weight="balanced"`** from `default_classifier_factory` (keep
  `StandardScaler` + `LogisticRegression(max_iter=1000)`).
- Keep `rolling_origin_classify` and `evaluate_podium` (the regression test uses
  them).
- Add `band_for(p: float) -> str` (§6).
- Note in the docstring: removing balancing is the overconfidence fix; isotonic/
  Platt calibration is intentionally deferred until there is data to fit it (§5).

## 9. Out of scope (deferred — clean extension points, no lying stubs)

- **Frontend:** glyph system (helmet glyph + number + 3-letter code, team colors,
  contrast guard), `drivers.json` source of truth, band/uncertainty UI, the reveal.
  → **M3 frontend follow-up spec.**
- The `/api` route + the grounded narrative for podium (Haiku). → frontend spec / M4.
- **Live-2026 ingestion** and any isotonic/Platt **calibration machinery**. → M5,
  gated on measured calibration (§5).
- Pace-gap context (Model A) and stop-count strategy surfacing. → M4.

## 10. Logic-lives-in-`src/` migration

Notebook 05's inline `_prior_track_pace` becomes a **tested function**
`prior_track_pace(...)` in `src/features/friday.py` (strictly prior years at the
circuit, leakage-safe, impute 0.0). The notebook's constructor-standings feature is
**not** ported — Phase 1 cut it. This keeps the validated logic reusable and out of
notebook cells (house rule).

## 11. Testing

- **Regression / trust anchor** (`tests/test_podium_regression.py`): build (or load
  a fixture of) the podium table and reproduce nb 05's held-out metrics — Friday
  top-3 ≈ 0.711, Saturday ≈ 0.733, plus Brier — within a small tolerance. Proves the
  production port matches the spike.
- **Inference** (`tests/test_inference_no_fastf1.py` extension + new test): bands
  present, drivers sorted by `p_podium`, numbers rounded; the no-fastf1 subprocess
  guard still passes with `predict_podium` imported.
- **`band_for`** unit tests at the 0.20 / 0.50 boundaries.
- **Leakage:** assert the target weekend's rows are absent from the training slice
  returned by `store.prior_weekends` for a podium target.
- **Sparse prior:** a target with `< 8` prior weekends → qualitative low-confidence
  state (no `p_podium`).
- **Mode:** `auto` picks Saturday when grid present, Friday when absent; explicit
  override respected.

## 12. Done-When (this milestone)

`predict_podium` returns honest qualitative bands that sharpen Friday → Saturday for
any 2023–25 target weekend, computed fastf1-free from the persisted podium table
through the `store.prior_weekends` leakage chokepoint; the regression test
reproduces the validated nb 05 numbers; `p_podium` + `calibrated: false` +
`n_train_races` are returned so the %-upgrade is pre-wired; all M1 invariants and
the full existing test suite stay green.

## 13. Dependencies / Assumptions

- The validated `PACE_TABLE` exists / is buildable (for `prior_track_pace`) and race
  results are loadable for the 8-circuit × 3-season set (the batch build already
  loads these for `build_strategy_table`).
- sklearn is available for inference (already a dev dependency; podium is on the
  sklearn inference path, not the slim lookup-only lambda).
- No 2026 data, no network at inference time; the table is the only input.
