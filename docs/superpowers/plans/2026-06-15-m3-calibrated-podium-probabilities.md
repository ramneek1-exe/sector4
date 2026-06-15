# M3 — Calibrated Podium Probabilities (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a fastf1-free `predict_podium(year, gp, mode)` callable that turns the validated public signals (standings + form + prior-year track pace, + grid as available) into honest qualitative podium bands that sharpen Friday → Saturday, with the numeric `p_podium` carried through (flagged uncalibrated) so the %-upgrade is pre-wired.

**Architecture:** Mirrors the M1 inference pattern exactly — a pure batch transform (`build_podium_table`) produces a persisted parquet table; the inference callable reads only that table and trains a cheap logistic model at call time on strictly-prior weekends through the single leakage chokepoint `store.prior_weekends`. Inference never imports fastf1.

**Tech Stack:** Python 3.14, pandas, scikit-learn (LogisticRegression + StandardScaler), pytest, parquet/pyarrow. Spec: `docs/superpowers/specs/2026-06-15-m3-calibrated-podium-probabilities-design.md`.

**Branch:** `m3-calibrated-podium-probabilities` (already created; the spec is committed there).

**Test runner:** `PYTHONPATH=. .venv/bin/python -m pytest` (the repo needs `PYTHONPATH=.` for `import src`).

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/calendar.py` | Modify | Add `GP_TO_EVENT` (circuit-key → results `EventName`) canonical mapping. |
| `src/features/friday.py` | Modify | Add tested `prior_track_pace(pace_df, gp, driver, year)` (logic moved out of nb 05). |
| `src/models/podium_model.py` | Modify | Drop `class_weight="balanced"`; add `band_for(p)`; doc the calibration rationale. |
| `src/store.py` | Modify | Add `PODIUM_TABLE = "data/podium_features.parquet"`. |
| `src/pipeline.py` | Modify | Add pure `build_podium_table(pace_df, results, ...)` transform. |
| `src/inference/podium.py` | Create | The `predict_podium` callable (fastf1-free; bands + flagged `p_podium`). |
| `src/inference/__init__.py` | Modify | Register `predict_podium` in `__all__` + lazy `__getattr__`. |
| `tests/test_friday.py` | Modify | Tests for `prior_track_pace`. |
| `tests/test_podium_model.py` | Modify | Tests for `band_for`; assert default factory is unbalanced. |
| `tests/test_pipeline.py` | Modify | Tests for `build_podium_table` (synthetic frames; label, leakage, imputes). |
| `tests/test_inference_podium.py` | Create | Behavior tests for `predict_podium` (synthetic table). |
| `tests/test_inference_no_fastf1.py` | Modify | Add `predict_podium` to the export + no-fastf1 guards. |
| `notebooks/07_podium.py` | Create | Trust-anchor: production-path real-data reproduction script. |
| `notebooks/PODIUM_M3_RESULTS.md` | Create | Captured trust-anchor output (the §0 numbers). |

---

## Task 1: `GP_TO_EVENT` canonical mapping in `src/calendar.py`

**Files:**
- Modify: `src/calendar.py`
- Test: `tests/test_calendar.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_calendar.py`:

```python
from src.calendar import GP_TO_EVENT, DRY_CIRCUITS


def test_gp_to_event_covers_every_dry_circuit():
    # Every circuit key used by the feature tables must map to a results EventName.
    for gp in DRY_CIRCUITS:
        assert gp in GP_TO_EVENT
        assert GP_TO_EVENT[gp].endswith("Grand Prix")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_calendar.py::test_gp_to_event_covers_every_dry_circuit -v`
Expected: FAIL with `ImportError: cannot import name 'GP_TO_EVENT'`.

- [ ] **Step 3: Add the mapping**

In `src/calendar.py`, after the `SEASONS` definition, add:

```python
# Circuit key (feature-table `gp`) -> results EventName, for joining race results
# (standings/form/track history). Canonical home so notebooks/pipeline share one map.
GP_TO_EVENT = {
    "Bahrain": "Bahrain Grand Prix",
    "Saudi Arabia": "Saudi Arabian Grand Prix",
    "Spain": "Spanish Grand Prix",
    "Hungary": "Hungarian Grand Prix",
    "Italy": "Italian Grand Prix",
    "Mexico City": "Mexico City Grand Prix",
    "Las Vegas": "Las Vegas Grand Prix",
    "Abu Dhabi": "Abu Dhabi Grand Prix",
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_calendar.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calendar.py tests/test_calendar.py
git commit -m "feat: add GP_TO_EVENT canonical circuit->event mapping"
```

---

## Task 2: `prior_track_pace` in `src/features/friday.py`

Move nb 05's inline `_prior_track_pace` into a tested `src/` function (house rule: logic in `src/`). Prior-year race pace at the circuit, strictly prior years, leakage-safe; `NaN` when none (the build imputes 0.0).

**Files:**
- Modify: `src/features/friday.py`
- Test: `tests/test_friday.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_friday.py`:

```python
import numpy as np
import pandas as pd

from src.features.friday import prior_track_pace


def _pace_df():
    return pd.DataFrame([
        {"gp": "Spain", "Driver": "VER", "year": 2023, "race_pace_delta": 0.10},
        {"gp": "Spain", "Driver": "VER", "year": 2024, "race_pace_delta": 0.30},
        {"gp": "Spain", "Driver": "VER", "year": 2025, "race_pace_delta": 0.99},
        {"gp": "Spain", "Driver": "HAM", "year": 2024, "race_pace_delta": 0.50},
    ])


def test_prior_track_pace_averages_strictly_prior_years():
    # 2025 sees 2023+2024 only (mean of 0.10, 0.30) -> 0.20; never the 2025 row.
    assert prior_track_pace(_pace_df(), "Spain", "VER", 2025) == 0.20


def test_prior_track_pace_nan_when_no_prior_year():
    # HAM's first Spain is 2024 -> no strictly-prior year -> NaN.
    assert np.isnan(prior_track_pace(_pace_df(), "Spain", "HAM", 2024))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_friday.py::test_prior_track_pace_averages_strictly_prior_years -v`
Expected: FAIL with `ImportError: cannot import name 'prior_track_pace'`.

- [ ] **Step 3: Implement the function**

Add to `src/features/friday.py` (after `track_history_finish`):

```python
def prior_track_pace(pace_df: pd.DataFrame, gp: str, driver: str, year: int) -> float:
    """Driver's mean race-pace delta at this circuit in strictly prior years.

    Leakage-safe (year < the target year only). NaN when the driver has no prior
    year at the circuit; callers impute 0.0 (a neutral pace delta). `pace_df` must
    have columns gp, Driver, year, race_pace_delta (the Phase-1 pace feature table).
    """
    vals = pace_df.loc[
        (pace_df["gp"] == gp)
        & (pace_df["Driver"] == driver)
        & (pace_df["year"] < year),
        "race_pace_delta",
    ]
    return float(vals.mean()) if len(vals) else float("nan")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_friday.py -v`
Expected: PASS (new tests + existing friday tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/friday.py tests/test_friday.py
git commit -m "feat: prior_track_pace feature (out of nb05 into src)"
```

---

## Task 3: `band_for` + drop balanced in `src/models/podium_model.py`

**Files:**
- Modify: `src/models/podium_model.py`
- Test: `tests/test_podium_model.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_podium_model.py`:

```python
from src.models.podium_model import band_for, default_classifier_factory


def test_band_for_thresholds():
    assert band_for(0.80) == "strong"
    assert band_for(0.50) == "strong"            # boundary inclusive
    assert band_for(0.49) == "in contention"
    assert band_for(0.20) == "in contention"     # boundary inclusive
    assert band_for(0.19) == "outside shot"
    assert band_for(0.0) == "outside shot"


def test_default_classifier_is_not_class_balanced():
    # Dropping class_weight="balanced" is the calibration fix (spec §0/§8).
    clf = default_classifier_factory()
    logreg = clf.named_steps["logisticregression"]
    assert logreg.class_weight is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_podium_model.py::test_band_for_thresholds tests/test_podium_model.py::test_default_classifier_is_not_class_balanced -v`
Expected: FAIL — `band_for` import error; `class_weight` is currently `"balanced"`.

- [ ] **Step 3: Edit the model module**

In `src/models/podium_model.py`, change `default_classifier_factory` to drop the
balancing, and add `band_for`. Replace:

```python
def default_classifier_factory():
    return make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=1000, class_weight="balanced"),
    )
```

with:

```python
def default_classifier_factory():
    # No class_weight="balanced": on the small sample it made probabilities
    # overconfident (predicted 0.86 where the real podium rate was 0.49). Removing
    # it nearly halves held-out Brier while top-3 holds (spec §0). Proper isotonic/
    # Platt calibration is deferred until 2026 data is large enough to fit it.
    return make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=1000),
    )


# Qualitative bands are the product surface while calibration is immature. Thresholds
# anchored to observed podium rates; labels describe chance relative to the field,
# never certainty (spec §6).
def band_for(p: float) -> str:
    if p >= 0.50:
        return "strong"
    if p >= 0.20:
        return "in contention"
    return "outside shot"
```

Also update the module docstring's parenthetical to read: *"The base estimator is a
standardized logistic regression (no class balancing — that overconfidence fix is in
`default_classifier_factory`); proper isotonic calibration needs more data than ~22
weekends provide."*

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_podium_model.py -v`
Expected: PASS (new tests + the 4 existing rolling-origin/evaluate tests still green — they pass their own factory).

- [ ] **Step 5: Commit**

```bash
git add src/models/podium_model.py tests/test_podium_model.py
git commit -m "feat: drop class_weight balanced + add band_for (calibration fix)"
```

---

## Task 4: `PODIUM_TABLE` constant in `src/store.py`

**Files:**
- Modify: `src/store.py`
- Test: `tests/test_store.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_store.py`:

```python
def test_podium_table_constant_defined():
    from src import store
    assert store.PODIUM_TABLE == "data/podium_features.parquet"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_store.py::test_podium_table_constant_defined -v`
Expected: FAIL with `AttributeError: module 'src.store' has no attribute 'PODIUM_TABLE'`.

- [ ] **Step 3: Add the constant**

In `src/store.py`, below `STRATEGY_TABLE`:

```python
PODIUM_TABLE = "data/podium_features.parquet"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_store.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store.py tests/test_store.py
git commit -m "feat: add PODIUM_TABLE store constant"
```

---

## Task 5: `build_podium_table` pure transform in `src/pipeline.py`

A pure `(pace_df, results) -> table` transform — no internal I/O so it is fully
unit-testable on synthetic frames and stays fastf1-free in the test. (The trust-anchor
script in Task 9 does the real read→build→write.)

**Files:**
- Modify: `src/pipeline.py`
- Test: `tests/test_pipeline.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_pipeline.py`:

```python
import numpy as np
import pandas as pd

from src.pipeline import build_podium_table


def _pace_df():
    # Two circuits x two years, 3 drivers. race_pace_delta lower = faster.
    rows = []
    for year in (2023, 2024):
        for gp in ("Spain", "Italy"):
            for i, drv in enumerate(["VER", "HAM", "NOR"]):
                rows.append({
                    "race_id": f"{year}-{gp}", "year": year, "gp": gp, "Driver": drv,
                    "race_pace_delta": 0.1 * i, "grid_position": i + 1,
                    "finish_pos": i + 1,
                })
    return pd.DataFrame(rows)


def _results():
    # Minimal results: one row per (year, event, driver) with date/points/finish.
    events = {"Spain": "Spanish Grand Prix", "Italy": "Italian Grand Prix"}
    rows = []
    for year in (2023, 2024):
        for gp, event in events.items():
            for i, drv in enumerate(["VER", "HAM", "NOR"]):
                rows.append({
                    "year": year, "round": 1 if gp == "Spain" else 2, "gp": event,
                    "date": pd.Timestamp(f"{year}-0{4 if gp=='Spain' else 9}-01"),
                    "Driver": drv, "finish_pos": i + 1, "points": 25 - 7 * i,
                    "team": "T",
                })
    return pd.DataFrame(rows)


def test_build_podium_table_has_features_and_label():
    t = build_podium_table(_pace_df(), _results())
    needed = {"race_id", "year", "gp", "Driver", "podium",
              "champ_points_before", "champ_rank_before", "form_finish_avg3",
              "prior_track_pace", "grid_position"}
    assert needed.issubset(t.columns)
    # podium label = finish_pos <= 3 (all 3 drivers podium here)
    assert set(t["podium"].unique()) == {1}
    # no NaNs left in the imputed feature columns
    for col in ["champ_points_before", "champ_rank_before", "form_finish_avg3", "prior_track_pace"]:
        assert not t[col].isna().any()


def test_build_podium_table_prior_track_pace_is_leakage_safe():
    t = build_podium_table(_pace_df(), _results())
    # 2023 rows have no prior year at the circuit -> imputed 0.0
    y23 = t[t["year"] == 2023]
    assert (y23["prior_track_pace"] == 0.0).all()
    # 2024-Spain VER sees only 2023-Spain VER (race_pace_delta 0.0) -> 0.0
    row = t[(t["race_id"] == "2024-Spain") & (t["Driver"] == "VER")].iloc[0]
    assert row["prior_track_pace"] == 0.0
```

(The "feature set excludes `finish_pos`" assertion lives in Task 6's
`test_feature_columns_exclude_finish`, where `SATURDAY_COLS` is defined.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_pipeline.py::test_build_podium_table_has_features_and_label -v`
Expected: FAIL with `ImportError: cannot import name 'build_podium_table'`.

- [ ] **Step 3: Implement the transform**

In `src/pipeline.py`, add the imports near the top (with the other `src.features` imports):

```python
from src.calendar import GP_TO_EVENT
from src.features.friday import add_friday_features, prior_track_pace
```

Then add the function:

```python
def build_podium_table(pace_df: pd.DataFrame, results: pd.DataFrame,
                       gp_to_event: dict = GP_TO_EVENT) -> pd.DataFrame:
    """Per-driver-per-weekend podium feature table (pure transform; no I/O).

    Inputs: the Phase-1 pace feature table (race_id/year/gp/Driver/race_pace_delta/
    grid_position/finish_pos) and the season results table (for standings/form/track
    history). Output adds the Friday-state features, prior_track_pace, and the binary
    `podium` label. Imputes Friday-state missingness so the model never sees NaN.
    Leakage: `finish_pos` is the label source only and is never a feature; grid is a
    legal pre-race input; prior_track_pace uses strictly prior years (spec §4).
    """
    df = pace_df[["race_id", "year", "gp", "Driver",
                  "finish_pos", "grid_position", "race_pace_delta"]].copy()
    df["podium"] = (df["finish_pos"] <= 3).astype(int)
    df = add_friday_features(df, results, gp_to_event)
    df["prior_track_pace"] = [
        prior_track_pace(pace_df, r.gp, r.Driver, r.year)
        for r in df.itertuples(index=False)
    ]
    df["champ_points_before"] = df["champ_points_before"].fillna(0.0)
    df["champ_rank_before"] = df["champ_rank_before"].fillna(10.5)
    df["form_finish_avg3"] = df["form_finish_avg3"].fillna(10.5)
    df["prior_track_pace"] = df["prior_track_pace"].fillna(0.0)
    return df
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_pipeline.py::test_build_podium_table_has_features_and_label tests/test_pipeline.py::test_build_podium_table_prior_track_pace_is_leakage_safe -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.py tests/test_pipeline.py
git commit -m "feat: build_podium_table pure transform"
```

---

## Task 6: `predict_podium` callable in `src/inference/podium.py`

**Files:**
- Create: `src/inference/podium.py`
- Modify: `src/inference/__init__.py`
- Test: `tests/test_inference_podium.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_inference_podium.py`:

```python
"""Tests for predict_podium (M3 headline backend; bands + flagged p_podium)."""
import pandas as pd

from src.inference.podium import predict_podium, FRIDAY_COLS, SATURDAY_COLS


def _podium_table(n_train_weekends=10, with_grid=True):
    """Synthetic table: champ rank strongly predicts podium; >= warmup weekends."""
    rows = []
    drivers = ["VER", "NOR", "LEC", "HAM", "PIA", "RUS"]
    weekends = [f"2023-W{i:02d}" for i in range(n_train_weekends)] + ["2024-Bahrain"]
    for rid in weekends:
        year = int(rid[:4])
        for rank, drv in enumerate(drivers, start=1):
            podium = int(rank <= 3)
            row = {
                "race_id": rid, "year": year,
                "gp": "Bahrain" if rid.endswith("Bahrain") else rid[5:],
                "Driver": drv, "podium": podium,
                "champ_rank_before": rank, "champ_points_before": 200 - 30 * rank,
                "form_finish_avg3": float(rank), "prior_track_pace": 0.05 * rank,
                "grid_position": rank if with_grid else float("nan"),
                "finish_pos": rank,
            }
            rows.append(row)
    return pd.DataFrame(rows)


def test_predict_podium_returns_sorted_bands_and_flagged_proba():
    out = predict_podium(2024, "Bahrain", table=_podium_table())
    assert out["qualitative"] is True          # bands are the surface
    assert out["calibrated"] is False          # numeric % not trusted yet
    assert out["mode"] == "saturday"           # grid present -> Saturday
    ps = [d["p_podium"] for d in out["drivers"]]
    assert ps == sorted(ps, reverse=True)      # sorted by probability desc
    top = out["drivers"][0]
    assert set(top) == {"driver", "band", "p_podium", "rank"}
    assert top["band"] in {"strong", "in contention", "outside shot"}
    assert top["p_podium"] == round(top["p_podium"], 2)
    assert top["rank"] == 1


def test_mode_auto_picks_friday_when_no_grid():
    out = predict_podium(2024, "Bahrain", table=_podium_table(with_grid=False))
    assert out["mode"] == "friday"


def test_explicit_mode_override_respected():
    out = predict_podium(2024, "Bahrain", mode="friday", table=_podium_table())
    assert out["mode"] == "friday"


def test_empty_target_is_qualitative():
    out = predict_podium(2030, "Narnia", table=_podium_table())
    assert out["qualitative"] is True
    assert out["drivers"] == []
    assert "no feature row" in out["reason"]


def test_sparse_prior_is_qualitative_without_proba():
    out = predict_podium(2024, "Bahrain", table=_podium_table(n_train_weekends=3))
    assert out["qualitative"] is True
    assert out["drivers"] == []
    assert out["n_train_races"] == 3


def test_feature_columns_exclude_finish():
    assert "finish_pos" not in SATURDAY_COLS
    assert "grid_position" in SATURDAY_COLS
    assert "grid_position" not in FRIDAY_COLS
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_podium.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.inference.podium'`.

- [ ] **Step 3: Implement the callable**

Create `src/inference/podium.py`:

```python
"""predict_podium — M3 headline: calibrated podium probabilities as honest bands.

Reads ONLY the persisted podium feature table (no fastf1) and trains a logistic
model on strictly prior weekends via store.prior_weekends (the leakage chokepoint,
calendar order). The product surface is qualitative bands; the numeric p_podium is
returned but flagged `calibrated: false` so the %-upgrade is pre-wired for when 2026
calibration matures (spec §5). Sharpens Friday -> Saturday: Saturday adds the actual
grid. Numbers rounded at the boundary. (spec §6, §7)
"""
from __future__ import annotations

import pandas as pd

from src import store
from src.calendar import race_id
from src.models.podium_model import band_for, default_classifier_factory

# Feature columns declared here (NOT imported from feature-build modules) to keep
# this module's import graph fastf1-free, matching pace.py's pattern.
BASE_COLS = ["champ_rank_before", "champ_points_before", "form_finish_avg3"]
FRIDAY_COLS = BASE_COLS + ["prior_track_pace"]
SATURDAY_COLS = FRIDAY_COLS + ["grid_position"]
MIN_TRAIN_RACES = 8  # the validated rolling-origin warmup (spec §2)


def _resolve_mode(target: pd.DataFrame, mode: str) -> str:
    """auto -> saturday when the target weekend has a known grid, else friday."""
    if mode in ("friday", "saturday"):
        return mode
    has_grid = "grid_position" in target and target["grid_position"].notna().all()
    return "saturday" if has_grid else "friday"


def predict_podium(year: int, gp: str, mode: str = "auto",
                   table: pd.DataFrame | None = None,
                   model_factory=default_classifier_factory) -> dict:
    """Per-driver podium band (+ flagged p_podium), sharpening Friday -> Saturday."""
    table = table if table is not None else store.read_table(store.PODIUM_TABLE)
    target = table[table["race_id"] == race_id(year, gp)]
    if target.empty:
        return {"year": year, "gp": gp, "qualitative": True, "calibrated": False,
                "reason": "no feature row for target weekend", "drivers": []}

    prior = store.prior_weekends(table, year, gp)
    n_train = int(prior["race_id"].nunique())
    if n_train < MIN_TRAIN_RACES or prior["podium"].nunique() < 2:
        return {"year": year, "gp": gp, "qualitative": True, "calibrated": False,
                "n_train_races": n_train,
                "reason": "too few prior weekends for a calibrated podium",
                "drivers": []}

    resolved = _resolve_mode(target, mode)
    cols = SATURDAY_COLS if resolved == "saturday" else FRIDAY_COLS

    model = model_factory()
    model.fit(prior[cols], prior["podium"])
    proba = model.predict_proba(target[cols])[:, 1]

    drivers = [
        {"driver": d, "band": band_for(float(p)), "p_podium": round(float(p), 2)}
        for d, p in zip(target["Driver"], proba)
    ]
    drivers.sort(key=lambda r: r["p_podium"], reverse=True)
    for i, d in enumerate(drivers, start=1):
        d["rank"] = i
    return {"year": year, "gp": gp, "mode": resolved, "qualitative": True,
            "calibrated": False, "n_train_races": n_train, "drivers": drivers}
```

- [ ] **Step 4: Register on the inference surface**

In `src/inference/__init__.py`, add `"predict_podium"` to `__all__` and the dispatch:

```python
__all__ = ["lookup_stat", "predict_pace_gaps", "predict_stop_counts", "predict_podium"]
```

and inside `__getattr__`, before the final `raise`:

```python
    if name == "predict_podium":
        from src.inference.podium import predict_podium
        return predict_podium
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_podium.py tests/test_pipeline.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/inference/podium.py src/inference/__init__.py tests/test_inference_podium.py
git commit -m "feat: predict_podium callable (honest bands, Friday->Saturday)"
```

---

## Task 7: Extend the no-fastf1 / export guard

**Files:**
- Modify: `tests/test_inference_no_fastf1.py`

- [ ] **Step 1: Update the test to require `predict_podium`**

In `tests/test_inference_no_fastf1.py`:

In `test_importing_inference_does_not_import_fastf1`, add `"src.inference.podium"`
to the module-pop list:

```python
    for name in ["src.inference", "src.inference.lookup",
                 "src.inference.pace", "src.inference.strategy",
                 "src.inference.podium"]:
        sys.modules.pop(name, None)
```

In `test_public_callables_are_exported`, add:

```python
    assert hasattr(inf, "predict_podium")
```

- [ ] **Step 2: Add a fresh-interpreter guard that podium stays fastf1-free**

Append this test to `tests/test_inference_no_fastf1.py`:

```python
def test_podium_path_does_not_import_fastf1():
    # Fresh interpreter: importing + calling the podium path must not pull fastf1.
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    code = (
        "import sys\n"
        "from src.inference.podium import predict_podium\n"
        "bad = [m for m in sys.modules if m == 'fastf1' or m.startswith('fastf1.')]\n"
        "assert not bad, bad\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=repo_root, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_inference_no_fastf1.py -v`
Expected: PASS (3 existing + 1 new; exports + both no-fastf1 guards green).

- [ ] **Step 4: Commit**

```bash
git add tests/test_inference_no_fastf1.py
git commit -m "test: guard predict_podium export + fastf1-free import"
```

---

## Task 8: Full suite green

**Files:** none (verification gate).

- [ ] **Step 1: Run the entire Python suite**

Run: `PYTHONPATH=. .venv/bin/python -m pytest -q`
Expected: all tests pass (the prior 79 + the M3 additions). If the TS/vitest suite
is part of CI, it is untouched by this milestone.

- [ ] **Step 2: If anything fails, fix before proceeding.** Do not continue to the trust anchor with a red suite.

---

## Task 9: Trust-anchor script + RESULTS.md (real-data reproduction)

Reproduces the production held-out numbers from real data (spec §0). This is the
manual real-data validation (like nb 06), not a CI pytest — `data/` is gitignored.

**Files:**
- Create: `notebooks/07_podium.py`
- Create: `notebooks/PODIUM_M3_RESULTS.md`

- [ ] **Step 1: Write the script**

Create `notebooks/07_podium.py`:

```python
"""M3 trust anchor — production-path podium reproduction (real data, manual run).

Builds the podium table via the production code (build_podium_table) from the
persisted Phase-1 tables, runs the rolling-origin podium classifier in Friday and
Saturday modes, and prints held-out top-3 + Brier + band reliability. Reproduces the
spec §0 numbers, proving the production path is faithful.

Run from repo root:  PYTHONPATH=. .venv/bin/python notebooks/07_podium.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.calendar import DRY_CIRCUITS, SEASONS, calendar_order
from src.data.results import load_results
from src.models.podium_model import (
    band_for,
    default_classifier_factory,
    evaluate_podium,
    rolling_origin_classify,
)
from src.pipeline import build_podium_table
from src.inference.podium import FRIDAY_COLS, SATURDAY_COLS

pace_df = pd.read_parquet("data/spike_features.parquet")
results = load_results(SEASONS)
df = build_podium_table(pace_df, results)

ordered = [r for r in calendar_order(SEASONS, DRY_CIRCUITS) if r in set(df["race_id"])]
min_train = sum(r.startswith(str(SEASONS[0])) for r in ordered)
print(f"rows={len(df)} weekends={len(ordered)} min_train={min_train} "
      f"base_rate={df['podium'].mean():.3f}")


def run(cols):
    res = rolling_origin_classify(
        df, cols, "podium", "race_id", "finish_pos",
        min_train_races=min_train, model_factory=default_classifier_factory,
        ordered_races=ordered,
    )
    return evaluate_podium(res), res


for name, cols in [("FRIDAY", FRIDAY_COLS), ("SATURDAY", SATURDAY_COLS)]:
    m, res = run(cols)
    print(f"{name:9} top3={m['top3']:.3f} brier={m['brier']:.3f} n={m['n_races']}")
    proba = np.concatenate([r["proba"] for r in res])
    outcome = np.concatenate([(r["finish_pos"] <= 3).astype(float) for r in res])
    print(f"  band reliability ({name}):")
    for lo, hi, label in [(0.5, 1.01, "strong"), (0.2, 0.5, "in contention"),
                          (0.0, 0.2, "outside shot")]:
        sel = (proba >= lo) & (proba < hi)
        if sel.sum():
            print(f"    {label:14} pred={proba[sel].mean():.2f} "
                  f"actual={outcome[sel].mean():.2f} n={int(sel.sum())}")
```

- [ ] **Step 2: Run it and capture output**

Run: `PYTHONPATH=. .venv/bin/python notebooks/07_podium.py`
Expected (within small tolerance — spec §0): `SATURDAY top3=0.733 brier=0.071`,
`FRIDAY top3=0.689 brier=0.085`, base_rate≈0.162, weekends≈23, min_train=8.

**If FRIDAY/SATURDAY top-3 or Brier differ materially from §0**, stop and
investigate (likely a build/column mismatch) before writing RESULTS — do not paper
over a discrepancy.

- [ ] **Step 3: Write `notebooks/PODIUM_M3_RESULTS.md`**

Capture the script's actual printed output verbatim in a results doc with: the
headline table (Friday/Saturday top-3 + Brier), the band-reliability rows, the
"dropping balanced nearly halves Brier" finding vs the balanced baseline (spec §0
table), and the honest caveats (small sample; nb 05's 0.711 was a qsim-filter
artifact; bands not %; Saturday model still under raw grid 0.778). Use the real
numbers the run produced, not the spec's approximations.

- [ ] **Step 4: Confirm the §6 bands hold against the reliability rows**

If the `strong` band's actual rate is wildly off its ≥0.50 threshold on the
unbalanced model, note it in RESULTS and flag for the band-threshold review (spec
§6 is explicitly owner-confirmable). Otherwise record that bands are confirmed.

- [ ] **Step 5: Commit**

```bash
git add notebooks/07_podium.py notebooks/PODIUM_M3_RESULTS.md
git commit -m "docs: M3 trust-anchor podium reproduction + results"
```

---

## Task 10: Update `handoff.md`

**Files:**
- Modify: `handoff.md`

- [ ] **Step 1: Update the status + next-steps**

Update `handoff.md`: mark M3 backend slice complete (the `predict_podium` callable,
podium feature table, bands-not-%, the dropped-balanced calibration win with the §0
numbers, and the qsim-artifact correction to nb 05's 0.711). Set the next action to
the **M3 frontend follow-up** (glyph system + `drivers.json` + band UI), and note
the `%`-upgrade maturity gate that M5 inherits (spec §5). Refresh the last-updated
date to 2026-06-15.

- [ ] **Step 2: Commit**

```bash
git add handoff.md
git commit -m "docs: handoff — M3 backend slice complete"
```

---

## Self-Review notes (for the executor)

- **Spec coverage:** §0 numbers → Task 9; §4 table → Task 5; §5 bands-now/calibration-ready
  → Task 6 return shape; §6 band scheme → Task 3 `band_for` + Task 9 reliability check;
  §7 contract → Task 6; §8 model change → Task 3; §10 logic-migration → Task 2; §11 tests
  → Tasks 5–9.
- **Type consistency:** `FRIDAY_COLS`/`SATURDAY_COLS`/`BASE_COLS` defined once in
  `src/inference/podium.py` and imported everywhere else (Task 5 test, Task 9 script).
  Label column is `podium` everywhere (not nb 05's `was_podium`). `band_for` thresholds
  match the spec §6 table and the Task 3 boundary tests.
- **Known intentional deviation from the spec's older prose:** the trust anchor is a
  script + RESULTS.md, not a pytest (spec §0/§11 already corrected to say so).
- **Band-threshold review** (spec §6) is an open owner decision surfaced in Task 9 Step 4
  — not a blocker for the callable.
```
