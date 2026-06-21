# M5 Private Beta (Phases A+B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue, sharpen, and log Sector 4 predictions for the live 2026 Austrian GP (and onward), running the validated models against real 2026 data for the first time.

**Architecture:** Phase A rolls the season machinery into 2026 — a real 2026 calendar, full-circuit feature builds, recency-weighted telemetry training — so the existing fastf1-free inference layer can predict *any* 2026 weekend. Phase B adds the beta-delivery surface: a frozen, shareable `/weekend` page fed by a schedule-aware Vercel Cron job that snapshots predictions at the pre-quali and post-quali checkpoints, pulls actual results after the race, and accumulates a season calibration record in Vercel Blob.

**Tech Stack:** Python (pandas, scikit-learn, fastf1 — batch only), Next.js App Router + TypeScript, Vercel Python serverless fns, Vercel Cron, Vercel Blob (`@vercel/blob`), pytest, vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-m5-private-beta-design.md`. Phase C (sprint-aware podium for the British GP) is a **separate later plan**, written after Austria ships.

## Global Constraints

Every task implicitly includes these (from the spec + CLAUDE.md):

- **Inference never imports fastf1.** Only `src/pipeline.py` + `src/data/*` touch fastf1/`cache/`. Enforced by `tests/test_inference_no_fastf1.py` — keep it green.
- **All training goes through `store.prior_weekends`** (true calendar order, never alphabetical `race_id` sort).
- **Leakage guards:** nothing race-derived feeds that race; standings/form/track-history from strictly prior races; FP from this weekend only.
- **Round every number that reaches output.**
- **All logic lives in `src/`** (Python) / `app/lib/` (TS); serverless fns + routes are thin glue.
- **Frontend:** ASCII rendering stays on canvas; gate all motion behind `prefers-reduced-motion`.
- **Never oversell:** podium = honest bands, NOT a telemetry edge; stop-count carries `SC_CAVEAT` always; pace = "supporting context, not a podium call"; pit-loss returns null ("not available") for non-curated circuits.
- **No numeric podium `%`** in any UI — bands only (`p_podium` stays flagged `calibrated: false`). M5 *accumulates* calibration data; it does not flip the switch.
- **Commits:** conventional style, one logical change each, **no AI/Claude attribution** (no co-author trailer, no robot emoji) — message is only the change description.

---

## Phase 0 — De-risk gate (BLOCKS everything)

### Task 1: Confirm fastf1 serves 2026 data

**Files:**
- Create: `scripts/derisk_2026.py`

**Interfaces:**
- Produces: nothing importable — a one-shot diagnostic that prints availability and exits non-zero on failure.

This is a **verification spike**, not TDD. Its output is a hard checkpoint: if any probe fails, STOP and report — Phase A's ingestion assumptions change materially.

- [ ] **Step 1: Write the probe script**

```python
# scripts/derisk_2026.py
"""De-risk gate for M5: confirm fastf1 serves the 2026 season + the Austrian GP.

Run: PYTHONPATH=. .venv/bin/python scripts/derisk_2026.py
Exits 0 only if all probes pass. Prints a human-readable report.
"""
from __future__ import annotations

import sys

import fastf1

from src.data.load import enable_cache

YEAR = 2026
TARGET_GP = "Austrian Grand Prix"


def main() -> int:
    enable_cache()
    ok = True

    sched = fastf1.get_event_schedule(YEAR, include_testing=False)
    rounds = [r for r in sched["RoundNumber"].tolist() if r != 0]
    events = sched["EventName"].tolist()
    print(f"[schedule] 2026 rounds found: {len(rounds)}")
    print(f"[schedule] events: {events}")
    has_austria = any("Austria" in e for e in events)
    print(f"[schedule] Austrian GP present: {has_austria}")
    ok = ok and len(rounds) > 0 and has_austria

    # Results so far this season (podium inputs: standings/form).
    completed = 0
    for rnd in rounds:
        try:
            s = fastf1.get_session(YEAR, rnd, "R")
            s.load(laps=False, telemetry=False, weather=False, messages=False)
            if s.results is not None and not s.results.empty:
                completed += 1
        except Exception as e:  # noqa: BLE001
            print(f"[results] round {rnd}: no results ({e})")
    print(f"[results] 2026 rounds with race results: {completed}")
    ok = ok and completed > 0

    # FP telemetry for the target weekend (pace/stop-count inputs).
    try:
        fp = fastf1.get_session(YEAR, TARGET_GP, "FP2")
        fp.load(telemetry=False, weather=True, messages=False)
        n_laps = 0 if fp.laps is None else len(fp.laps)
        print(f"[FP2 Austria 2026] laps: {n_laps}")
        ok = ok and n_laps > 0
    except Exception as e:  # noqa: BLE001
        print(f"[FP2 Austria 2026] UNAVAILABLE: {e}")
        ok = False

    # Prior-year Austria for prior_track_pace.
    for py in (2025, 2024):
        try:
            r = fastf1.get_session(py, TARGET_GP, "R")
            r.load(laps=True, telemetry=False, weather=False, messages=False)
            print(f"[prior {py} Austria] laps: {0 if r.laps is None else len(r.laps)}")
        except Exception as e:  # noqa: BLE001
            print(f"[prior {py} Austria] UNAVAILABLE: {e}")
            ok = False

    print("\nDE-RISK GATE:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run it**

Run: `PYTHONPATH=. .venv/bin/python scripts/derisk_2026.py`
Expected: prints a report ending in `DE-RISK GATE: PASS`.

- [ ] **Step 3: CHECKPOINT — report findings before proceeding**

If `PASS`: record the actual numbers (rounds completed, FP2 lap count) in the handoff and continue to Task 2. If `FAIL` on FP telemetry only: the telemetry cards (pace/stop-count) degrade to qualitative for Austria — note it and continue (podium still ships). If `FAIL` on schedule/results: **STOP** — the milestone needs re-scoping (simulated stand-in); do not proceed.

- [ ] **Step 4: Commit**

```bash
git add scripts/derisk_2026.py
git commit -m "chore: add 2026 de-risk probe script for M5"
```

---

## Phase A — 2026 readiness

### Task 2: Real 2026 calendar + full-circuit mapping

**Files:**
- Modify: `src/calendar.py`
- Test: `tests/test_calendar.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RACE_CALENDAR: dict[int, list[str]]` (year → ordered short gp keys); `calendar_order()` now flattens `RACE_CALENDAR`; `GP_TO_EVENT` extended to every circuit referenced by `RACE_CALENDAR`. `DRY_CIRCUITS`/`SEASONS` retained (validation set) and unchanged in value.

The leakage guard depends on true calendar order, so 2026 must be listed in **real schedule order** up to and including Austria. 2023–25 keep the validated dry list (the validation set); 2026 lists the real rounds run so far + the target. Use the round order printed by Task 1.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_calendar.py  (add to existing)
from src.calendar import RACE_CALENDAR, calendar_order, GP_TO_EVENT, race_id


def test_2026_is_last_in_calendar_order():
    order = calendar_order()
    # Austria 2026 must sit after every 2023-25 race and after prior 2026 rounds.
    austria = race_id(2026, "Austria")
    assert austria in order
    assert order.index(austria) == max(
        order.index(r) for r in order if r.startswith("2026-") and r != austria
    ) + 1 or all(not r.startswith("2026-") or r == austria for r in order)


def test_every_calendar_circuit_has_event_mapping():
    for circuits in RACE_CALENDAR.values():
        for gp in circuits:
            assert gp in GP_TO_EVENT, f"{gp} missing from GP_TO_EVENT"
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_calendar.py -q`
Expected: FAIL — `RACE_CALENDAR` does not exist.

- [ ] **Step 3: Implement**

Replace the calendar-order plumbing in `src/calendar.py`. Keep `DRY_CIRCUITS`/`SEASONS`/`race_id` exactly as they are; add `RACE_CALENDAR` (2023–25 = the dry set for validation parity; 2026 = real order from Task 1 — fill the list with the actual rounds the probe reported, ending at "Austria"), extend `GP_TO_EVENT` to cover all 2026 circuits, and make `calendar_order()` flatten `RACE_CALENDAR`:

```python
# Real per-season race order. 2023-25 keep the validated dry set (validation parity);
# 2026 lists the real rounds run so far, in schedule order, ending at the target. The
# leakage guard (store.prior_weekends) depends on this being true calendar order.
RACE_CALENDAR: dict[int, list[str]] = {
    2023: DRY_CIRCUITS,
    2024: DRY_CIRCUITS,
    2025: DRY_CIRCUITS,
    # REAL 2026 round order through Austria, from scripts/derisk_2026.py (rounds 1-8;
    # round 8 Austria is the upcoming target, rounds 1-7 completed). NOTE: 2026 has both
    # "Barcelona Grand Prix" (round 7, Catalunya) AND "Spanish Grand Prix" (Madrid, later)
    # — keep them as DISTINCT keys. No Bahrain/Saudi at the front this season.
    2026: ["Australia", "China", "Japan", "Miami", "Canada", "Monaco",
           "Barcelona", "Austria"],
}

# Extend the event map to every circuit RACE_CALENDAR references. 2026 event names are
# the REAL fastf1 strings from the de-risk probe.
GP_TO_EVENT = {
    # validation dry set (2023-25 short keys)
    "Bahrain": "Bahrain Grand Prix",
    "Saudi Arabia": "Saudi Arabian Grand Prix",
    "Spain": "Spanish Grand Prix",
    "Hungary": "Hungarian Grand Prix",
    "Italy": "Italian Grand Prix",
    "Mexico City": "Mexico City Grand Prix",
    "Las Vegas": "Las Vegas Grand Prix",
    "Abu Dhabi": "Abu Dhabi Grand Prix",
    # 2026 calendar circuits (real fastf1 EventNames)
    "Australia": "Australian Grand Prix",
    "China": "Chinese Grand Prix",
    "Japan": "Japanese Grand Prix",
    "Miami": "Miami Grand Prix",
    "Canada": "Canadian Grand Prix",
    "Monaco": "Monaco Grand Prix",
    "Barcelona": "Barcelona Grand Prix",
    "Austria": "Austrian Grand Prix",
    "Great Britain": "British Grand Prix",
}
```

> Real 2026 schedule (round order) from the probe: Australia, China, Japan, Miami,
> Canada, Monaco, Barcelona, **Austria** (round 8, upcoming), British, Belgian,
> Hungarian, Dutch, Italian, Spanish (Madrid), Azerbaijan, Singapore, United States,
> Mexico City, São Paulo, Las Vegas, Qatar, Abu Dhabi. Validate short-key spelling
> against fastf1 when extending past Austria (esp. the Barcelona vs Spanish split).

```python
def calendar_order(seasons: list[int] | None = None,
                   circuits: list[str] | None = None) -> list[str]:
    """All race_ids in true calendar order (year-major, real per-season order).

    Default flattens RACE_CALENDAR. The legacy (seasons, circuits) signature is kept
    for the validation notebooks/tests that pass the dry set explicitly.
    """
    if seasons is None and circuits is None:
        return [race_id(y, gp) for y in sorted(RACE_CALENDAR) for gp in RACE_CALENDAR[y]]
    seasons = seasons if seasons is not None else SEASONS
    circuits = circuits if circuits is not None else DRY_CIRCUITS
    return [race_id(y, gp) for y in seasons for gp in circuits]
```

> NOTE: the `2026` list above is a placeholder ORDER — replace it verbatim with the real round order printed by Task 1 before committing. The exact circuit names must match fastf1's short keys (verify against the probe output; e.g. "Great Britain" vs "Britain").

- [ ] **Step 4: Run the test**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_calendar.py -q`
Expected: PASS.

- [ ] **Step 5: Run the full Python suite (calendar is load-bearing)**

Run: `PYTHONPATH=. .venv/bin/python -m pytest -q`
Expected: all pass (the legacy `calendar_order(seasons, circuits)` callers still work).

- [ ] **Step 6: Commit**

```bash
git add src/calendar.py tests/test_calendar.py
git commit -m "feat: real 2026 race calendar + full-circuit event mapping"
```

### Task 3: Curate Austria (+ Britain) track facts

**Files:**
- Modify: `src/features/track.py`
- Test: `tests/test_track.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `_TRACKS` gains `"Austria"` and `"Great Britain"`; `CURATED_TRACKS = frozenset(_TRACKS)` therefore includes them, so pit-loss lookups return real numbers (not null) for these circuits.

Curated public circuit facts only (lap length, corner count, coarse abrasiveness 1–5, typical pit-lane loss in s) — no derived data, no branding. Red Bull Ring: 4.318 km, 10 corners, low-medium abrasiveness, short lap → ~21 s pit loss. Silverstone: 5.891 km, 18 corners, medium abrasiveness, ~20 s.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_track.py  (add)
from src.features.track import track_features, CURATED_TRACKS


def test_austria_curated():
    assert "Austria" in CURATED_TRACKS
    f = track_features("Austria")
    assert f["length_km"] == 4.318
    assert f["pit_loss_s"] == 21.0


def test_britain_curated():
    assert "Great Britain" in CURATED_TRACKS
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_track.py -q`
Expected: FAIL — "Austria" not in `CURATED_TRACKS`.

- [ ] **Step 3: Implement** — add to `_TRACKS` in `src/features/track.py`:

```python
    # short lap, medium-deg, hot (Red Bull Ring)
    "Austria": {"length_km": 4.318, "n_corners": 10, "abrasiveness": 3, "pit_loss_s": 21.0},
    # fast flowing, medium-deg (Silverstone)
    "Great Britain": {"length_km": 5.891, "n_corners": 18, "abrasiveness": 3, "pit_loss_s": 20.0},
```

- [ ] **Step 4: Run the test**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_track.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/track.py tests/test_track.py
git commit -m "feat: curate Austria + Britain track facts"
```

### Task 4: Recency-weight helper

**Files:**
- Create: `src/inference/weights.py`
- Test: `tests/test_weights.py`

**Interfaces:**
- Produces: `recency_weights(prior: pd.DataFrame, target_year: int, half_life_years: float = 2.0) -> np.ndarray` — one weight per row of `prior`, aligned to `prior`'s row order, computed as `0.5 ** ((target_year - row.year) / half_life_years)`. Same-year rows → 1.0; older seasons decay. `half_life_years` is tunable (Task 7 picks the value that preserves the +0.07 anchor).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_weights.py
import numpy as np
import pandas as pd

from src.inference.weights import recency_weights


def test_same_year_weight_is_one():
    prior = pd.DataFrame({"year": [2026, 2026]})
    w = recency_weights(prior, target_year=2026)
    assert np.allclose(w, [1.0, 1.0])


def test_older_seasons_decay_with_half_life():
    prior = pd.DataFrame({"year": [2024, 2026]})
    w = recency_weights(prior, target_year=2026, half_life_years=2.0)
    # 2024 is 2 years back -> exactly half; 2026 -> full.
    assert np.allclose(w, [0.5, 1.0])


def test_alignment_to_row_order():
    prior = pd.DataFrame({"year": [2026, 2023]})
    w = recency_weights(prior, target_year=2026, half_life_years=1.0)
    assert w[0] == 1.0 and w[1] < w[0]
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_weights.py -q`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```python
# src/inference/weights.py
"""Recency sample-weights for cross-era training (M5).

Down-weights older / other-regulation seasons so the 2026 reg-reset season counts
more as it accumulates, without discarding the 2023-25 history outright. Pure numpy
+ pandas; no fastf1. Half-life is tunable and validated against the +0.07 stop-count
anchor (the chosen value must NOT regress it — see the M5 plan, Task 7).
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def recency_weights(prior: pd.DataFrame, target_year: int,
                    half_life_years: float = 2.0) -> np.ndarray:
    """Per-row training weights, exponentially decaying with season age.

    weight = 0.5 ** ((target_year - row.year) / half_life_years). Aligned to
    `prior`'s row order. `prior` must have a 'year' column.
    """
    age = (target_year - prior["year"].to_numpy(dtype=float))
    age = np.clip(age, 0.0, None)  # future rows (shouldn't exist) never up-weight
    return np.power(0.5, age / half_life_years)
```

- [ ] **Step 4: Run the test**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_weights.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/inference/weights.py tests/test_weights.py
git commit -m "feat: recency sample-weight helper for cross-era training"
```

### Task 5: Recency-weight the pace model fit

**Files:**
- Modify: `src/inference/pace.py:41-42`
- Test: `tests/test_pace_inference.py` (add)

**Interfaces:**
- Consumes: `recency_weights` (Task 4).
- Produces: `predict_pace_gaps` gains a `half_life_years: float = 2.0` kwarg; the RF fit passes `sample_weight`.

- [ ] **Step 1: Write the failing test** (asserts the weighted fit is invoked and output shape is unchanged)

```python
# tests/test_pace_inference.py  (add)
import pandas as pd

from src.inference.pace import predict_pace_gaps, PACE_INFER_COLS


def _toy_pace_table():
    rows = []
    for i, rid in enumerate(["2026-Bahrain", "2026-Spain", "2026-Canada", "2026-Austria"]):
        for d in ("VER", "NOR", "LEC"):
            rows.append({"race_id": rid, "year": 2026, "gp": rid.split("-", 1)[1],
                         "Driver": d, "race_pace_delta": 0.1 * i,
                         **{c: 1.0 for c in PACE_INFER_COLS}})
    return pd.DataFrame(rows)


def test_pace_runs_weighted_without_error():
    out = predict_pace_gaps(2026, "Austria", table=_toy_pace_table(), half_life_years=1.0)
    assert out["qualitative"] is False
    assert {"driver", "pace_delta_s", "uncertainty_s"} <= set(out["drivers"][0])
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_pace_inference.py -q`
Expected: FAIL — `predict_pace_gaps()` got an unexpected keyword `half_life_years`.

- [ ] **Step 3: Implement** — update the signature + fit in `src/inference/pace.py`:

```python
from src.inference.weights import recency_weights  # add near the other imports
```

```python
def predict_pace_gaps(year: int, gp: str, table: pd.DataFrame | None = None,
                      model_factory=default_model_factory,
                      half_life_years: float = 2.0) -> dict:
```

```python
    model = model_factory()
    w = recency_weights(prior, year, half_life_years)
    model.fit(prior[PACE_INFER_COLS], prior["race_pace_delta"], sample_weight=w)
```

- [ ] **Step 4: Run the test + the no-fastf1 guard**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_pace_inference.py tests/test_inference_no_fastf1.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/inference/pace.py tests/test_pace_inference.py
git commit -m "feat: recency-weight the pace-gap model fit"
```

### Task 6: Recency-weight the stop-count model fit

**Files:**
- Modify: `src/inference/strategy.py:51-52`
- Test: `tests/test_strategy_inference.py` (add)

**Interfaces:**
- Consumes: `recency_weights` (Task 4).
- Produces: `predict_stop_counts` gains `half_life_years: float = 2.0`; the classifier fit passes `sample_weight`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_strategy_inference.py  (add)
import pandas as pd

from src.inference.strategy import predict_stop_counts, STRATEGY_FEATURES


def _toy_strategy_table():
    rows = []
    for i, rid in enumerate(["2026-Bahrain", "2026-Spain", "2026-Canada", "2026-Austria"]):
        for d, n in (("VER", 1), ("NOR", 2), ("LEC", 1)):
            rows.append({"race_id": rid, "year": 2026, "gp": rid.split("-", 1)[1],
                         "Driver": d, "n_stops": n,
                         **{c: float(i + 1) for c in STRATEGY_FEATURES}})
    return pd.DataFrame(rows)


def test_strategy_runs_weighted_with_dominant():
    out = predict_stop_counts(2026, "Austria", table=_toy_strategy_table(), half_life_years=1.0)
    assert out["sc_caveat"]
    assert out["dominant"] is None or "n_stops" in out["dominant"]
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_strategy_inference.py -q`
Expected: FAIL — unexpected keyword `half_life_years`.

- [ ] **Step 3: Implement** — in `src/inference/strategy.py`:

```python
from src.inference.weights import recency_weights  # add near the other imports
```

```python
def predict_stop_counts(year: int, gp: str, table: pd.DataFrame | None = None,
                        half_life_years: float = 2.0) -> dict:
```

```python
    clf = _classifier()
    w = recency_weights(prior, year, half_life_years)
    clf.fit(prior[STRATEGY_FEATURES], prior["n_stops"], sample_weight=w)
```

- [ ] **Step 4: Run the test + guard**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_strategy_inference.py tests/test_inference_no_fastf1.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/inference/strategy.py tests/test_strategy_inference.py
git commit -m "feat: recency-weight the stop-count model fit"
```

### Task 7: Re-validate the +0.07 stop-count anchor WITH weights

**Files:**
- Create: `scripts/validate_recency_weights.py`
- Create: `notebooks/M5_RECENCY_RESULTS.md` (record the numbers)

**Interfaces:**
- Consumes: the validated nb 06 rolling-origin path + `recency_weights`.
- Produces: a documented decision — the `half_life_years` value that preserves the +0.07 edge becomes the production default (update Tasks 4–6 default if it differs from 2.0).

This is a **validation gate**, not a feature. The anchor (nb 06) reproduces **+0.070** (0.711 vs 0.641 track-norm) on 2023–25. Applying season-decay weights changes that fit; we must confirm it does not regress, and pick the gentlest decay that holds.

- [ ] **Step 1: Write the validation script**

```python
# scripts/validate_recency_weights.py
"""M5 gate: does recency-weighting preserve the +0.07 stop-count edge on 2023-25?

Re-runs the nb 06 rolling-origin stop-count backtest with several half-lives and
prints accuracy vs the track-norm baseline for each. Pick the gentlest decay (largest
half-life among those that hold the edge) as the production default.

Run: PYTHONPATH=. .venv/bin/python scripts/validate_recency_weights.py
"""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import RandomForestClassifier

from src import store
from src.calendar import calendar_order
from src.inference.strategy import STRATEGY_FEATURES
from src.inference.weights import recency_weights

BASELINE = 0.641  # track-norm (nb 06)
TARGET_EDGE = 0.07


def rolling_acc(df, order, half_life):
    races = [r for r in order if r in set(df["race_id"])]
    hits, total = 0, 0
    for i in range(3, len(races)):
        train = df[df["race_id"].isin(races[:i])]
        test = df[df["race_id"] == races[i]]
        if test.empty or train["n_stops"].nunique() < 2:
            continue
        clf = RandomForestClassifier(n_estimators=200, random_state=0)
        yr = int(test["year"].iloc[0])
        w = None if half_life is None else recency_weights(train, yr, half_life)
        clf.fit(train[STRATEGY_FEATURES], train["n_stops"], sample_weight=w)
        pred = clf.predict(test[STRATEGY_FEATURES])
        hits += int((pred == test["n_stops"].to_numpy()).sum())
        total += len(test)
    return hits / total if total else float("nan")


def main():
    df = store.read_table(store.STRATEGY_TABLE)
    # validation parity: restrict to the dry validation set's race_ids
    order = calendar_order([2023, 2024, 2025])
    unweighted = rolling_acc(df, order, None)
    print(f"unweighted (anchor): {unweighted:.3f}  edge {unweighted - BASELINE:+.3f}")
    for hl in (4.0, 3.0, 2.0, 1.0):
        acc = rolling_acc(df, order, hl)
        ok = (acc - BASELINE) >= TARGET_EDGE - 0.005
        print(f"half_life={hl}: {acc:.3f}  edge {acc - BASELINE:+.3f}  {'OK' if ok else 'REGRESSED'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `PYTHONPATH=. .venv/bin/python scripts/validate_recency_weights.py`
Expected: the `unweighted (anchor)` line shows `edge +0.070` (reproduces nb 06); at least one half-life shows `OK`.

- [ ] **Step 3: CHECKPOINT — choose the default + record**

Pick the **largest** half-life still marked `OK` (gentlest decay that holds the edge). If it differs from `2.0`, update the default in `src/inference/weights.py`, `pace.py`, `strategy.py`. If NONE hold (all regress), the fallback is to gate weighting so it only applies once `prior` mixes a 2026 row with pre-2026 rows (otherwise `half_life=inf` → uniform); implement that in `recency_weights` and re-run. Document the chosen value + the table in `notebooks/M5_RECENCY_RESULTS.md`.

- [ ] **Step 4: Commit**

```bash
git add scripts/validate_recency_weights.py notebooks/M5_RECENCY_RESULTS.md src/inference/weights.py src/inference/pace.py src/inference/strategy.py
git commit -m "test: validate recency weights preserve the +0.07 stop-count edge"
```

### Task 8: Build 2026 feature tables + refresh live results

**Files:**
- Modify: `src/data/results.py:54-64` (live-season cache refresh)
- Modify: `src/pipeline.py:162-169` (`build_all` builds the 2026 target slice)
- Test: `tests/test_results_refresh.py` (add)

**Interfaces:**
- Consumes: Task 2 calendar.
- Produces: regenerated `data/{pace,strategy,podium,team_map,season_results}.parquet` containing 2026 + Austria, copied into `api/`.

The results cache currently returns stale data for an in-progress season (if 2026 ⊆ cached years it never refetches new rounds). Add a `refresh_year` escape hatch so the live season is always re-pulled.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_results_refresh.py
import inspect
from src.data import results


def test_load_results_supports_refresh_year():
    sig = inspect.signature(results.load_results)
    assert "refresh_year" in sig.parameters
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_results_refresh.py -q`
Expected: FAIL — no `refresh_year` parameter.

- [ ] **Step 3: Implement** — update `load_results` in `src/data/results.py`:

```python
def load_results(years: list[int], cache_path: str = "data/season_results.parquet",
                 refresh_year: int | None = None) -> pd.DataFrame:
    """Load (and cache) all race results for the given seasons, sorted by date.

    `refresh_year` forces a re-pull of that season (an in-progress season gains rounds
    over time, so its cached slice goes stale). All other cached seasons are reused.
    """
    cached = pd.read_parquet(cache_path) if os.path.exists(cache_path) else None
    if (cached is not None and set(years).issubset(set(cached["year"].unique()))
            and refresh_year is None):
        return cached[cached["year"].isin(years)].reset_index(drop=True)
    frames = []
    for y in years:
        if cached is not None and y != refresh_year and y in set(cached["year"].unique()):
            frames.append(cached[cached["year"] == y])
        else:
            frames.append(load_season_results(y))
    out = pd.concat([f for f in frames if not f.empty], ignore_index=True)
    out = out.dropna(subset=["finish_pos"]).sort_values("date").reset_index(drop=True)
    out.to_parquet(cache_path)
    return out
```

- [ ] **Step 4: Run the test**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_results_refresh.py -q`
Expected: PASS.

- [ ] **Step 5: Regenerate the feature tables for 2026 (batch; needs fastf1 cache + network)**

The validated builders take `(seasons, circuits)`. Build the target slice = the 8 dry circuits (validation parity for the models) **plus** the 2026 calendar circuits through Austria, across 2023–2026. Run:

```bash
PYTHONPATH=. .venv/bin/python - <<'PY'
from src import store
from src.calendar import RACE_CALENDAR
from src.data.results import load_results
from src.pipeline import (build_pace_table, build_strategy_table,
                          build_podium_table, build_team_map)

seasons = [2023, 2024, 2025, 2026]
circuits = sorted({gp for c in RACE_CALENDAR.values() for gp in c})

store.write_table(load_results(seasons, refresh_year=2026), store.SEASON_RESULTS)
pace = build_pace_table(seasons, circuits)
store.write_table(pace, store.PACE_TABLE)
store.write_table(build_strategy_table(seasons, circuits), store.STRATEGY_TABLE)
results = store.read_table(store.SEASON_RESULTS)
store.write_table(build_podium_table(pace, results), store.PODIUM_TABLE)
store.write_table(build_team_map(results), store.TEAM_MAP)
print("tables rebuilt for", seasons)
PY
cp data/pace_features.parquet data/strategy_features.parquet data/team_map.parquet api/
cp data/podium_features.parquet api/podium_features.parquet
```

Expected: prints `tables rebuilt for [2023, 2024, 2025, 2026]`; `api/*.parquet` refreshed.

- [ ] **Step 6: Smoke-test inference for Austria 2026 directly**

```bash
PYTHONPATH=. .venv/bin/python - <<'PY'
import pandas as pd
from src.inference.podium import predict_podium
from src.inference.strategy import predict_stop_counts
print("podium:", predict_podium(2026, "Austria", table=pd.read_parquet("api/podium_features.parquet"))["qualitative"])
print("strategy dominant:", predict_stop_counts(2026, "Austria", table=pd.read_parquet("api/strategy_features.parquet"))["dominant"])
PY
```

Expected: podium returns a result (bands) and strategy returns a `dominant` dict (or qualitative if FP was thin per Task 1).

- [ ] **Step 7: Run the full Python suite**

Run: `PYTHONPATH=. .venv/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/data/results.py src/pipeline.py tests/test_results_refresh.py api/*.parquet
git commit -m "feat: build 2026 feature tables + live-season results refresh"
```

### Task 9: Frontend circuit normalization for 2026

**Files:**
- Modify: `app/lib/circuits.ts`
- Test: `app/lib/circuits.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CANONICAL_CIRCUITS` + `ALIASES` extended to the 2026 calendar (incl. Austria/Britain); a `DEFAULT_YEAR = 2026` constant the orchestrator uses when the parser omits a year.

- [ ] **Step 1: Write the failing test**

```typescript
// app/lib/circuits.test.ts  (add)
import { normalizeCircuit, DEFAULT_YEAR } from "./circuits";

it("normalizes 2026 circuits", () => {
  expect(normalizeCircuit("Austrian Grand Prix")).toBe("Austria");
  expect(normalizeCircuit("red bull ring")).toBe("Austria");
  expect(normalizeCircuit("Silverstone")).toBe("Great Britain");
  expect(normalizeCircuit("Spielberg")).toBe("Austria");
});

it("defaults to the live beta season", () => {
  expect(DEFAULT_YEAR).toBe(2026);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- circuits`
Expected: FAIL — Austria not recognized; `DEFAULT_YEAR` undefined.

- [ ] **Step 3: Implement** — add the new circuits to `CANONICAL_CIRCUITS`, the aliases to `ALIASES`, and export `DEFAULT_YEAR`:

```typescript
export const DEFAULT_YEAR = 2026;
```

Add to `CANONICAL_CIRCUITS`: `"Australia", "Japan", "China", "Miami", "Emilia Romagna", "Monaco", "Canada", "Austria", "Great Britain"`. Add to `ALIASES` (lowercased):

```typescript
  australia: "Australia", australian: "Australia", melbourne: "Australia",
  japan: "Japan", japanese: "Japan", suzuka: "Japan",
  china: "China", chinese: "China", shanghai: "China",
  miami: "Miami",
  "emilia romagna": "Emilia Romagna", imola: "Emilia Romagna",
  monaco: "Monaco", monte: "Monaco", "monte carlo": "Monaco",
  canada: "Canada", canadian: "Canada", montreal: "Canada",
  austria: "Austria", austrian: "Austria", "red bull ring": "Austria",
  spielberg: "Austria",
  britain: "Great Britain", british: "Great Britain", "great britain": "Great Britain",
  silverstone: "Great Britain", uk: "Great Britain",
```

> If `normalizeLookupCircuit` (M4) maintains its own list, extend it the same way so deg/stint lookups resolve the new circuits too.

- [ ] **Step 4: Run the test + full vitest**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/lib/circuits.ts app/lib/circuits.test.ts
git commit -m "feat: normalize 2026 calendar circuits + default to 2026 season"
```

---

## Phase B — Beta delivery

### Task 10: Snapshot schema + Blob store helper

**Files:**
- Create: `app/lib/snapshot.ts`
- Create: `app/lib/blob.ts`
- Test: `app/lib/snapshot.test.ts`

**Interfaces:**
- Produces:
  - `type Checkpoint = "pre-quali" | "post-quali" | "final"`
  - `interface WeekendSnapshot { year: number; gp: string; checkpoint: Checkpoint; issuedAt: string; podium: unknown; pace: unknown; strategy: unknown; actuals?: unknown; calibrationNote: string }`
  - `snapshotKey(year, gp, checkpoint): string` → `"weekends/2026-Austria/pre-quali.json"`
  - `latestKey(year, gp): string` → `"weekends/2026-Austria/latest.json"`
  - `seasonIndexKey(year): string` → `"calibration/2026-index.json"`
  - `app/lib/blob.ts`: `putJson(key, value)`, `getJson<T>(key): Promise<T | null>` wrapping `@vercel/blob` (`put` with `access:"public"`, `addRandomSuffix:false`; read via the returned/derived URL with `fetch`).

- [ ] **Step 1: Install the dependency**

Run: `npm install @vercel/blob`
Expected: added to `package.json`.

- [ ] **Step 2: Write the failing test (pure key/schema logic — no network)**

```typescript
// app/lib/snapshot.test.ts
import { snapshotKey, latestKey, seasonIndexKey } from "./snapshot";

it("builds stable blob keys", () => {
  expect(snapshotKey(2026, "Austria", "pre-quali")).toBe(
    "weekends/2026-Austria/pre-quali.json",
  );
  expect(latestKey(2026, "Austria")).toBe("weekends/2026-Austria/latest.json");
  expect(seasonIndexKey(2026)).toBe("calibration/2026-index.json");
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm run test -- snapshot`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `app/lib/snapshot.ts`**

```typescript
// app/lib/snapshot.ts
// Frozen per-weekend prediction snapshot (the "issued" artifact + the logged
// prediction). Keys are deterministic so the cron can write idempotently and the
// /weekend page can read the latest without listing.

export type Checkpoint = "pre-quali" | "post-quali" | "final";

export interface WeekendSnapshot {
  year: number;
  gp: string;
  checkpoint: Checkpoint;
  issuedAt: string; // ISO timestamp
  podium: unknown;
  pace: unknown;
  strategy: unknown;
  actuals?: unknown;
  calibrationNote: string;
}

const slug = (year: number, gp: string) => `${year}-${gp.replace(/\s+/g, "-")}`;

export const snapshotKey = (year: number, gp: string, c: Checkpoint) =>
  `weekends/${slug(year, gp)}/${c}.json`;
export const latestKey = (year: number, gp: string) =>
  `weekends/${slug(year, gp)}/latest.json`;
export const seasonIndexKey = (year: number) => `calibration/${year}-index.json`;
```

- [ ] **Step 5: Implement `app/lib/blob.ts`**

```typescript
// app/lib/blob.ts
// Thin Vercel Blob JSON wrapper. Public access (the /weekend page reads it client- or
// server-side); deterministic pathnames (addRandomSuffix:false) so latest.json is
// overwritable and readable by key.
import { put, head } from "@vercel/blob";

const base = () => process.env.BLOB_PUBLIC_BASE_URL?.replace(/\/$/, "");

export async function putJson(key: string, value: unknown): Promise<string> {
  const { url } = await put(key, JSON.stringify(value), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
  });
  return url;
}

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const url = base() ? `${base()}/${key}` : (await head(key)).url;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Run the test**

Run: `npm run test -- snapshot`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/lib/snapshot.ts app/lib/blob.ts app/lib/snapshot.test.ts package.json package-lock.json
git commit -m "feat: weekend snapshot schema + Vercel Blob JSON helper"
```

### Task 11: Snapshot builder (assemble predictions into a frozen snapshot)

**Files:**
- Create: `app/lib/build-snapshot.ts`
- Test: `app/lib/build-snapshot.test.ts`

**Interfaces:**
- Consumes: `WeekendSnapshot`, `Checkpoint` (Task 10); the existing `postJson` helper / `/api/{podium,pace,strategy}` endpoints (M3/M4).
- Produces: `buildSnapshot(year, gp, checkpoint, deps?): Promise<WeekendSnapshot>` where `deps` lets tests inject a fake fetcher: `{ fetchPrediction: (path, body) => Promise<unknown> }`. Podium `mode` = `"friday"` for `pre-quali`, `"auto"` for `post-quali`/`final`.

- [ ] **Step 1: Write the failing test**

```typescript
// app/lib/build-snapshot.test.ts
import { buildSnapshot } from "./build-snapshot";

it("assembles a pre-quali snapshot in friday mode", async () => {
  const calls: { path: string; body: any }[] = [];
  const snap = await buildSnapshot(2026, "Austria", "pre-quali", {
    fetchPrediction: async (path, body) => {
      calls.push({ path, body });
      return { ok: path };
    },
  });
  expect(snap.checkpoint).toBe("pre-quali");
  expect(snap.year).toBe(2026);
  expect(snap.issuedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  // podium asked for friday mode pre-quali
  const podium = calls.find((c) => c.path.includes("podium"));
  expect(podium?.body.mode).toBe("friday");
  expect(snap.calibrationNote).toMatch(/not yet calibrated/i);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- build-snapshot`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```typescript
// app/lib/build-snapshot.ts
// Assemble the three prediction cards into one frozen snapshot for a checkpoint.
// Pre-quali pins podium to friday mode (no grid yet); post-quali/final let it auto-
// sharpen (grid present). Network is injected so this is unit-testable.
import { DEFAULT_YEAR } from "./circuits";
import type { Checkpoint, WeekendSnapshot } from "./snapshot";

export interface SnapshotDeps {
  fetchPrediction: (path: string, body: Record<string, unknown>) => Promise<unknown>;
}

const CAL_NOTE =
  "Podium shown as honest bands, not a telemetry edge — probabilities are not yet " +
  "calibrated and will sharpen as the 2026 season accumulates.";

export async function buildSnapshot(
  year: number,
  gp: string,
  checkpoint: Checkpoint,
  deps?: SnapshotDeps,
): Promise<WeekendSnapshot> {
  const fetchPrediction =
    deps?.fetchPrediction ??
    (async (path, body) => {
      const base = process.env.SELF_BASE_URL ?? "";
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      return res.ok ? res.json() : { error: res.status };
    });

  const mode = checkpoint === "pre-quali" ? "friday" : "auto";
  const [podium, pace, strategy] = await Promise.all([
    fetchPrediction("/api/podium", { year, gp, mode }),
    fetchPrediction("/api/pace", { year, gp }),
    fetchPrediction("/api/strategy", { year, gp }),
  ]);

  return {
    year: year ?? DEFAULT_YEAR,
    gp,
    checkpoint,
    issuedAt: new Date().toISOString(),
    podium,
    pace,
    strategy,
    calibrationNote: CAL_NOTE,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npm run test -- build-snapshot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/build-snapshot.ts app/lib/build-snapshot.test.ts
git commit -m "feat: assemble per-checkpoint weekend prediction snapshot"
```

### Task 12: Schedule resolver (which checkpoint is due now)

**Files:**
- Create: `app/lib/weekend-schedule.ts`
- Create: `app/data/weekend-schedule.json`
- Test: `app/lib/weekend-schedule.test.ts`

**Interfaces:**
- Produces: `interface SessionSchedule { year; gp; preQuali; postQuali; final }` (ISO timestamps — `preQuali` = after final practice, before quali; `postQuali` = after quali; `final` = after the race) and `dueCheckpoint(now: Date, sched: SessionSchedule): Checkpoint | null` returning the latest checkpoint whose time has passed. A committed `weekend-schedule.json` holds the current weekend's session times (set ahead of time from the published timetable — avoids a fastf1 call in the cron path).

Fixed cron times cannot track every circuit's timezone, so the cron fires often and this resolver decides which checkpoint is due. Idempotency (don't re-snapshot) lives in Task 13.

- [ ] **Step 1: Write the failing test**

```typescript
// app/lib/weekend-schedule.test.ts
import { dueCheckpoint, type SessionSchedule } from "./weekend-schedule";

const sched: SessionSchedule = {
  year: 2026, gp: "Austria",
  preQuali: "2026-06-26T16:00:00Z",
  postQuali: "2026-06-27T15:00:00Z",
  final: "2026-06-28T15:00:00Z",
};

it("returns null before any checkpoint", () => {
  expect(dueCheckpoint(new Date("2026-06-26T10:00:00Z"), sched)).toBeNull();
});
it("returns pre-quali after FP, before quali", () => {
  expect(dueCheckpoint(new Date("2026-06-26T17:00:00Z"), sched)).toBe("pre-quali");
});
it("returns post-quali after quali", () => {
  expect(dueCheckpoint(new Date("2026-06-27T18:00:00Z"), sched)).toBe("post-quali");
});
it("returns final after the race", () => {
  expect(dueCheckpoint(new Date("2026-06-28T18:00:00Z"), sched)).toBe("final");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- weekend-schedule`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the resolver + the data file**

```typescript
// app/lib/weekend-schedule.ts
import type { Checkpoint } from "./snapshot";

export interface SessionSchedule {
  year: number;
  gp: string;
  preQuali: string;  // after final practice, before qualifying
  postQuali: string; // after qualifying (grid known)
  final: string;     // after the race
}

export function dueCheckpoint(now: Date, s: SessionSchedule): Checkpoint | null {
  const t = now.getTime();
  if (t >= new Date(s.final).getTime()) return "final";
  if (t >= new Date(s.postQuali).getTime()) return "post-quali";
  if (t >= new Date(s.preQuali).getTime()) return "pre-quali";
  return null;
}
```

```json
// app/data/weekend-schedule.json  (set from the published Austria timetable; UTC)
{
  "year": 2026,
  "gp": "Austria",
  "preQuali": "2026-06-26T16:00:00Z",
  "postQuali": "2026-06-27T15:00:00Z",
  "final": "2026-06-28T15:00:00Z"
}
```

> Update this file before each beta weekend with that weekend's real session times. `app/data/*.json` is root-anchored in `.vercelignore` already (M3 fix) — confirm it ships.

- [ ] **Step 4: Run the test**

Run: `npm run test -- weekend-schedule`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/weekend-schedule.ts app/data/weekend-schedule.json app/lib/weekend-schedule.test.ts
git commit -m "feat: weekend session-schedule resolver for checkpoint timing"
```

### Task 13: Cron snapshot route (idempotent) + actuals/calibration

**Files:**
- Create: `app/api/cron/snapshot/route.ts`
- Create: `app/lib/actuals.ts`
- Modify: `vercel.json` (add `crons`)
- Test: `app/lib/actuals.test.ts`

**Interfaces:**
- Consumes: `dueCheckpoint` (Task 12), `buildSnapshot` (Task 11), `putJson`/`getJson` + keys (Task 10).
- Produces: `GET /api/cron/snapshot` — reads the committed schedule, computes the due checkpoint, and if no snapshot exists for it yet (idempotent via `getJson(snapshotKey)`), builds + writes it, updates `latest.json`, and (on `final`) writes actuals + appends to the season index. `app/lib/actuals.ts`: `computeCalibrationRow(podium, actualFinish): { brierContrib, top3 }` (pure).

- [ ] **Step 1: Write the failing test (pure calibration math)**

```typescript
// app/lib/actuals.test.ts
import { computeCalibrationRow } from "./actuals";

it("scores predicted bands against actual finish", () => {
  const podium = { drivers: [
    { driver: "VER", p_podium: 0.8 }, { driver: "NOR", p_podium: 0.6 },
    { driver: "LEC", p_podium: 0.5 }, { driver: "RUS", p_podium: 0.1 },
  ]};
  const actualFinish = ["VER", "NOR", "RUS"]; // top-3
  const row = computeCalibrationRow(podium, actualFinish);
  expect(row.top3).toBeGreaterThan(0);
  expect(row.brierContrib).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- actuals`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `app/lib/actuals.ts`**

```typescript
// app/lib/actuals.ts
// Pure scoring of issued podium probabilities vs the actual finishing order, for the
// season calibration record. No % is shown to users — this just accumulates evidence.
interface PodiumDriver { driver: string; p_podium: number }

export function computeCalibrationRow(
  podium: { drivers: PodiumDriver[] },
  actualFinish: string[],
): { brierContrib: number; top3: number } {
  const top3Actual = new Set(actualFinish.slice(0, 3));
  const drivers = podium.drivers ?? [];
  // pooled Brier over all driver rows: (p - outcome)^2
  const brier =
    drivers.reduce((acc, d) => {
      const outcome = top3Actual.has(d.driver) ? 1 : 0;
      return acc + (d.p_podium - outcome) ** 2;
    }, 0) / Math.max(drivers.length, 1);
  // predicted top-3 = 3 highest p_podium
  const predTop = [...drivers]
    .sort((a, b) => b.p_podium - a.p_podium)
    .slice(0, 3)
    .map((d) => d.driver);
  const hit = predTop.filter((d) => top3Actual.has(d)).length / 3;
  return { brierContrib: brier, top3: hit };
}
```

- [ ] **Step 4: Implement the cron route**

```typescript
// app/api/cron/snapshot/route.ts
// Schedule-aware, idempotent snapshot job. Vercel Cron hits this on a schedule; it
// fires each checkpoint exactly once (guarded by whether the snapshot already exists).
import { NextResponse } from "next/server";
import schedule from "@/app/data/weekend-schedule.json";
import { dueCheckpoint, type SessionSchedule } from "@/app/lib/weekend-schedule";
import { buildSnapshot } from "@/app/lib/build-snapshot";
import { putJson, getJson } from "@/app/lib/blob";
import {
  snapshotKey, latestKey, seasonIndexKey, type WeekendSnapshot,
} from "@/app/lib/snapshot";
import { computeCalibrationRow } from "@/app/lib/actuals";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Vercel Cron sends a bearer secret; reject anything else.
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const s = schedule as SessionSchedule;
  const due = dueCheckpoint(new Date(), s);
  if (!due) return NextResponse.json({ status: "no checkpoint due" });

  const key = snapshotKey(s.year, s.gp, due);
  const existing = await getJson<WeekendSnapshot>(key);
  if (existing) return NextResponse.json({ status: "already snapshotted", checkpoint: due });

  const snap = await buildSnapshot(s.year, s.gp, due);

  if (due === "final") {
    // Pull actuals + score (actuals source wired here; see note).
    const actualFinish = await getActualFinish(s.year, s.gp); // see Step 5 note
    snap.actuals = actualFinish;
    const cal = computeCalibrationRow(snap.podium as any, actualFinish);
    const idxKey = seasonIndexKey(s.year);
    const idx = (await getJson<any[]>(idxKey)) ?? [];
    idx.push({ gp: s.gp, issuedAt: snap.issuedAt, ...cal });
    await putJson(idxKey, idx);
  }

  await putJson(key, snap);
  await putJson(latestKey(s.year, s.gp), snap);
  return NextResponse.json({ status: "snapshotted", checkpoint: due });
}

// Actual finishing order. The fastf1-backed results live in the Python layer; expose a
// small read-only endpoint or reuse season_results. Minimal version: read from the
// already-bundled season_results via a tiny /api endpoint. Placeholder returns [].
async function getActualFinish(_year: number, _gp: string): Promise<string[]> {
  const base = process.env.SELF_BASE_URL ?? "";
  try {
    const res = await fetch(`${base}/api/results?year=${_year}&gp=${encodeURIComponent(_gp)}`, {
      cache: "no-store",
    });
    return res.ok ? ((await res.json()).finishOrder ?? []) : [];
  } catch {
    return [];
  }
}
```

> The `/api/results` endpoint (finishing order from `season_results.parquet`, refreshed post-race) is a small addition mirroring `api/podium.py`: read the bundled parquet, filter `year`+`gp` (via `GP_TO_EVENT`), sort by `finish_pos`, return `{finishOrder: [...Driver]}`. Add it as part of this task (`api/results.py` + `vercel.json` includeFiles `api/season_results.parquet`, and `cp data/season_results.parquet api/`). Keep it fastf1-free.

- [ ] **Step 5: Add the cron schedule to `vercel.json`**

```json
{
  "functions": {
    "api/inference.py": { "includeFiles": "{src/**,api/strategy_features.parquet}" },
    "api/podium.py": { "includeFiles": "{src/**,api/podium_features.parquet}" },
    "api/pace.py": { "includeFiles": "{src/**,api/pace_features.parquet,api/team_map.parquet}" },
    "api/strategy.py": { "includeFiles": "{src/**,api/strategy_features.parquet,api/team_map.parquet}" },
    "api/results.py": { "includeFiles": "{src/**,api/season_results.parquet}" }
  },
  "crons": [
    { "path": "/api/cron/snapshot", "schedule": "0 */2 * * *" }
  ]
}
```

> Every 2 hours is frequent enough to catch each checkpoint within the window while staying well within Hobby/Pro cron limits. The idempotency guard makes extra firings no-ops.

- [ ] **Step 6: Run the tests + build**

Run: `npm run test -- actuals && npm run build`
Expected: tests pass; `npm run build` clean (route compiles).

- [ ] **Step 7: Commit**

```bash
git add app/api/cron/snapshot/route.ts app/lib/actuals.ts app/lib/actuals.test.ts api/results.py vercel.json api/season_results.parquet
git commit -m "feat: schedule-aware cron snapshot + actuals/calibration logging"
```

### Task 14: `/weekend` page (the issued artifact)

**Files:**
- Create: `app/weekend/page.tsx`
- Modify: reuse existing card components (`PaceCard`/`StrategyCard`/podium card from `app/page.tsx` — extract to `app/components/` if still inline)

**Interfaces:**
- Consumes: `getJson` + `latestKey` (Task 10), `DEFAULT_YEAR` (Task 9), the existing prediction-card components.
- Produces: a server component reading the latest snapshot from Blob and rendering the three cards with a checkpoint label + timestamp + the calibration note.

- [ ] **Step 1: Extract the cards if inline** (only if they live inside `app/page.tsx`)

Move `PaceCard`, `StrategyCard`, and the podium card into `app/components/{PaceCard,StrategyCard,PodiumCard}.tsx`, exporting each, and import them back into `app/page.tsx`. Run `npm run build` to confirm no regression. Commit:

```bash
git commit -am "refactor: extract prediction cards for reuse on /weekend"
```

- [ ] **Step 2: Write the `/weekend` page**

```tsx
// app/weekend/page.tsx
// The issued artifact: this weekend's frozen predictions, read from the latest Blob
// snapshot. Not live per-request — testers see exactly what was frozen at the checkpoint.
import { getJson } from "@/app/lib/blob";
import { latestKey, type WeekendSnapshot } from "@/app/lib/snapshot";
import schedule from "@/app/data/weekend-schedule.json";
import { PodiumCard } from "@/app/components/PodiumCard";
import { PaceCard } from "@/app/components/PaceCard";
import { StrategyCard } from "@/app/components/StrategyCard";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  "pre-quali": "Issued Friday — pre-qualifying",
  "post-quali": "Sharpened Saturday — post-qualifying",
  final: "Final — race complete",
};

export default async function WeekendPage() {
  const snap = await getJson<WeekendSnapshot>(latestKey(schedule.year, schedule.gp));
  if (!snap) {
    return (
      <main className="legible">
        <p>No prediction issued yet for the {schedule.gp} Grand Prix. Check back after Friday practice.</p>
      </main>
    );
  }
  return (
    <main className="legible">
      <header>
        <h1>{snap.gp} Grand Prix {snap.year}</h1>
        <p>{LABEL[snap.checkpoint]} · {new Date(snap.issuedAt).toUTCString()}</p>
      </header>
      <PodiumCard data={snap.podium as any} />
      <PaceCard data={snap.pace as any} />
      <StrategyCard data={snap.strategy as any} />
      <p className="legible">{snap.calibrationNote}</p>
    </main>
  );
}
```

> Match the prop shapes the extracted cards already expect (adapt `data={...}` to their real props). Keep all motion behind `prefers-reduced-motion`, consistent with the existing cards.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean build; `/weekend` route listed.

- [ ] **Step 4: Run full test suites**

Run: `npm run test && PYTHONPATH=. .venv/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/weekend/page.tsx app/components/
git commit -m "feat: /weekend page rendering the frozen issued snapshot"
```

---

## Final verification (before merge)

- [ ] **De-risk gate passed** (Task 1) and its numbers recorded.
- [ ] **Recency anchor holds** — `notebooks/M5_RECENCY_RESULTS.md` shows the chosen half-life preserving +0.07 (Task 7).
- [ ] `PYTHONPATH=. .venv/bin/python -m pytest -q` — all pass.
- [ ] `npm run test` — all pass.
- [ ] `npm run build` — clean.
- [ ] **Live preview deploy:** `POST /api/podium` `{year:2026, gp:"Austria"}` → bands; `POST /api/pace` + `/api/strategy` → results (or honest qualitative if FP thin); `GET /api/cron/snapshot` (with `CRON_SECRET`) → writes a snapshot; `/weekend` renders it.
- [ ] **Env vars** set on Preview AND Production: `ANTHROPIC_API_KEY` (already), `BLOB_READ_WRITE_TOKEN` (Blob), `CRON_SECRET`, `BLOB_PUBLIC_BASE_URL`, `SELF_BASE_URL`.
- [ ] **Provision Vercel Blob** store for the project (Marketplace/Storage) before the cron runs.
- [ ] Use `superpowers:finishing-a-development-branch` to merge.

## Notes for the executor

- **Deadline:** Austria pre-quali snapshot must be live before **Fri 2026-06-26**. If Phase B automation slips, you can trigger `GET /api/cron/snapshot` manually (same code path) for Austria and let the cron own Britain.
- **Fallback if FP telemetry is thin** (Task 1 finding): pace/stop-count return qualitative; the `/weekend` page still ships podium. Don't fabricate telemetry numbers.
- **Phase C (sprint-aware podium for British GP, July 5)** is a separate plan — start it after Austria ships.
- The `2026` calendar list (Task 2) and `weekend-schedule.json` (Task 12) carry real-world values that MUST be filled from the de-risk probe + the published timetable, not the placeholders shown.
