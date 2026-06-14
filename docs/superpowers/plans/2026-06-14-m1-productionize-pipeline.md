# M1 — Productionize the Phase 1 Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the validated Phase 1 logic into a callable, cached, leakage-safe core Python library (the code M2 will mount behind the Vercel Python `/api/` path).

**Architecture:** Evolve `src/` in place (design Approach B). A **batch build** (`src/pipeline.py`) is the only layer that touches fastf1 + the ~225M `cache/`; it writes small parquet feature tables via `src/store.py`. An **inference** package (`src/inference/`) reads *only* those parquet tables — never fastf1 — loads a table, fits a cheap model on strictly-prior weekends through the single leakage chokepoint `store.prior_weekends`, and returns typed, rounded results for `lookup_stat`, pace-gap (Model A), and stop-count (Model B).

**Tech Stack:** Python, pandas, numpy, scikit-learn (RandomForest), scipy (Theil-Sen, existing), pyarrow (parquet), pytest. No Next.js / HTTP / LLM in M1.

**Spec:** `docs/superpowers/specs/2026-06-14-m1-productionize-pipeline-design.md`

**Conventions (from CLAUDE.md):** conventional commit messages, **no AI attribution lines**. Run tests from repo root. `from src...` absolute imports. Round every number that reaches output.

---

### Task 1: Canonical calendar ordering (`src/calendar.py`)

The leakage guard depends on TRUE calendar order, never alphabetical `race_id` sorting (Phase 1's silent look-ahead bug — `handoff.md` §2). This module is pure (no fastf1, no pandas).

**Files:**
- Create: `src/calendar.py`
- Test: `tests/test_calendar.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_calendar.py
"""Tests for canonical calendar ordering (M1)."""
from src.calendar import DRY_CIRCUITS, SEASONS, calendar_order, race_id


def test_race_id_format():
    assert race_id(2024, "Bahrain") == "2024-Bahrain"


def test_calendar_order_is_year_major_then_circuit_order():
    order = calendar_order(seasons=[2023, 2024], circuits=["Bahrain", "Spain"])
    assert order == ["2023-Bahrain", "2023-Spain", "2024-Bahrain", "2024-Spain"]


def test_calendar_order_not_alphabetical():
    # Abu Dhabi sorts before Bahrain alphabetically but is raced LAST in a season;
    # calendar order must keep it after Bahrain (the exact Phase 1 leakage trap).
    order = calendar_order(seasons=[2024])
    assert order.index("2024-Bahrain") < order.index("2024-Abu Dhabi")


def test_defaults_cover_eight_dry_circuits_three_seasons():
    assert len(DRY_CIRCUITS) == 8
    assert SEASONS == [2023, 2024, 2025]
    assert len(calendar_order()) == 24
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_calendar.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.calendar'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/calendar.py
"""Canonical calendar ordering + the dry circuit set (M1, design §4, §6).

The leakage guard (src/store.py) depends on TRUE calendar order, never
alphabetical race_id sorting — that was Phase 1's silent look-ahead bug
(handoff.md §2). DRY_CIRCUITS is maintained in season race order, so
year-major + list order = calendar order. race_id is "<year>-<gp>" to match
the Phase 1 feature tables. Pure module: no fastf1, no pandas.
"""
from __future__ import annotations

# Representative dry circuit set (handoff.md §3), listed in season race order.
DRY_CIRCUITS = [
    "Bahrain", "Saudi Arabia", "Spain", "Hungary",
    "Italy", "Mexico City", "Las Vegas", "Abu Dhabi",
]
SEASONS = [2023, 2024, 2025]


def race_id(year: int, gp: str) -> str:
    """Canonical race identifier, e.g. (2024, "Bahrain") -> "2024-Bahrain"."""
    return f"{year}-{gp}"


def calendar_order(seasons: list[int] = SEASONS,
                   circuits: list[str] = DRY_CIRCUITS) -> list[str]:
    """All race_ids in calendar order (year-major, circuit list order within year)."""
    return [race_id(y, gp) for y in seasons for gp in circuits]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_calendar.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/calendar.py tests/test_calendar.py
git commit -m "feat: add canonical calendar ordering for leakage-safe slicing"
```

---

### Task 2: Feature store + leakage chokepoint (`src/store.py`)

The single place the leakage guard lives, and the only I/O for the parquet feature tables that inference reads. Pure pandas + `src.calendar` (no fastf1).

**Files:**
- Create: `src/store.py`
- Test: `tests/test_store.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_store.py
"""Tests for the feature store + leakage-safe prior_weekends slice (M1)."""
import pandas as pd

from src.store import prior_weekends, read_table, write_table


def _table():
    # 2024-Abu Dhabi sorts BEFORE 2024-Bahrain alphabetically but is raced later.
    return pd.DataFrame(
        {
            "race_id": ["2023-Bahrain", "2023-Abu Dhabi",
                        "2024-Bahrain", "2024-Abu Dhabi"],
            "Driver": ["VER", "VER", "VER", "VER"],
            "val": [1, 2, 3, 4],
        }
    )


def test_prior_weekends_excludes_target_and_future():
    prior = prior_weekends(_table(), 2024, "Bahrain")
    ids = set(prior["race_id"])
    assert ids == {"2023-Bahrain", "2023-Abu Dhabi"}  # both 2023 races
    assert "2024-Bahrain" not in ids  # target excluded
    assert "2024-Abu Dhabi" not in ids  # future excluded


def test_prior_weekends_uses_calendar_not_alphabetical_order():
    # Predicting 2024-Bahrain: 2024-Abu Dhabi (alphabetically earlier) must NOT leak.
    prior = prior_weekends(_table(), 2024, "Bahrain")
    assert "2024-Abu Dhabi" not in set(prior["race_id"])


def test_prior_weekends_unknown_target_treats_all_placeable_as_prior():
    # A weekend not on the known calendar (e.g. a future 2026 race) -> all known prior.
    prior = prior_weekends(_table(), 2026, "Bahrain")
    assert len(prior) == 4


def test_write_then_read_roundtrips(tmp_path):
    path = str(tmp_path / "t.parquet")
    df = _table()
    write_table(df, path)
    back = read_table(path)
    pd.testing.assert_frame_equal(back, df)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_store.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.store'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/store.py
"""Feature-store I/O + the leakage-safe slicing chokepoint (M1, design §5, §6).

Inference reads ONLY these parquet tables — never fastf1. prior_weekends is the
single place the leakage guard lives: it returns rows strictly BEFORE the target
weekend in CALENDAR order (src.calendar), never alphabetical race_id sorting.
Pure pandas + src.calendar — importing this module does not import fastf1.
"""
from __future__ import annotations

import os

import pandas as pd

from src.calendar import calendar_order, race_id

PACE_TABLE = "data/pace_features.parquet"
STRATEGY_TABLE = "data/strategy_features.parquet"


def write_table(df: pd.DataFrame, path: str) -> None:
    """Persist a feature table to parquet, creating the directory if needed."""
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    df.to_parquet(path)


def read_table(path: str) -> pd.DataFrame:
    """Load a persisted feature table."""
    return pd.read_parquet(path)


def prior_weekends(table: pd.DataFrame, year: int, gp: str,
                   order: list[str] | None = None) -> pd.DataFrame:
    """Rows from races strictly BEFORE (year, gp) in calendar order.

    The single leakage chokepoint. `table` must have a 'race_id' column. When the
    target is on the known calendar, returns rows from earlier calendar positions
    only. When the target is NOT on the calendar (e.g. a future weekend we cannot
    place), every calendar-placeable row is treated as prior, which is the correct
    production semantic for an upcoming race after all known history.
    """
    order = order if order is not None else calendar_order()
    target = race_id(year, gp)
    present = set(table["race_id"])
    if target in order:
        cutoff = order.index(target)
        prior_ids = set(order[:cutoff])
    else:
        prior_ids = set(order)  # unknown future target: all known history is prior
    keep = prior_ids & present
    return table[table["race_id"].isin(keep)].copy()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_store.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/store.py tests/test_store.py
git commit -m "feat: add feature store with leakage-safe prior_weekends chokepoint"
```

---

### Task 3: Relocate Model B track-norm history into `src/features/strategy.py`

`add_history` (the leakage-safe track-norm) currently lives only inside `notebooks/06_strategy_compound.py`, violating "logic lives in `src/`." Move the pure-pandas piece into `strategy.py` (which imports only pandas — keeping it inference-safe). The fastf1 session loop moves to `pipeline.py` in Task 4.

**Files:**
- Modify: `src/features/strategy.py` (add `add_history`, add `import numpy as np`)
- Test: `tests/test_strategy.py` (append a test)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_strategy.py`:

```python
from src.features.strategy import add_history


def test_add_history_uses_strictly_prior_years_only():
    race_df = pd.DataFrame(
        {
            "gp": ["Bahrain", "Bahrain", "Bahrain"],
            "year": [2023, 2024, 2025],
            "modal_stops": [1, 2, 2],
            "dominant_compound": ["HARD", "MEDIUM", "MEDIUM"],
        }
    )
    df = pd.DataFrame({"gp": ["Bahrain", "Bahrain"], "year": [2024, 2025]})
    out = add_history(df, race_df).set_index("year")
    # 2024 sees only 2023 -> modal 1, HARD
    assert out.loc[2024, "hist_modal_stops"] == 1
    assert out.loc[2024, "hist_dominant"] == "HARD"
    # 2025 sees 2023+2024 -> modal of [1,2] = ties broken by mode().iloc[0]; dominant MEDIUM-vs-HARD
    assert out.loc[2025, "hist_dominant"] in {"HARD", "MEDIUM"}


def test_add_history_no_prior_year_is_nan_and_none():
    race_df = pd.DataFrame(
        {"gp": ["Spain"], "year": [2023], "modal_stops": [2],
         "dominant_compound": ["SOFT"]}
    )
    df = pd.DataFrame({"gp": ["Spain"], "year": [2023]})
    out = add_history(df, race_df).iloc[0]
    assert pd.isna(out["hist_modal_stops"])
    assert out["hist_dominant"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_strategy.py -v`
Expected: FAIL with `ImportError: cannot import name 'add_history'`

- [ ] **Step 3: Write minimal implementation**

In `src/features/strategy.py`, add the numpy import at the top (after `import pandas as pd`):

```python
import numpy as np
```

Then append this function (lifted verbatim from `notebooks/06_strategy_compound.py` to preserve the validated +0.07 numbers):

```python
def add_history(df: pd.DataFrame, race_df: pd.DataFrame) -> pd.DataFrame:
    """Track-norm history from strictly prior years (leakage-safe).

    For each row, hist_modal_stops / hist_dominant are the modal stop count and
    dominant compound at the same `gp` in EARLIER years only (year < row.year).
    Rows with no prior year get NaN / None. Pure pandas — no fastf1.
    """
    modal_hist, dom_hist = [], []
    for row in df.itertuples():
        prior = race_df[(race_df.gp == row.gp) & (race_df.year < row.year)]
        modal_hist.append(prior["modal_stops"].mode().iloc[0] if not prior.empty else np.nan)
        dom_hist.append(prior["dominant_compound"].mode().iloc[0] if not prior.empty else None)
    df = df.copy()
    df["hist_modal_stops"] = modal_hist
    df["hist_dominant"] = dom_hist
    return df
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_strategy.py -v`
Expected: PASS (all strategy tests, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/strategy.py tests/test_strategy.py
git commit -m "feat: move leakage-safe track-norm history into src/features/strategy"
```

---

### Task 4: Batch build pipeline (`src/pipeline.py`) + refactor notebook 06

The only layer that touches fastf1 + the cache. `build_pace_table` wraps the existing `assemble.build_dataset` over the calendar; `build_strategy_table` lifts notebook 06's session loop verbatim (so the validated numbers are unchanged) and reuses `strategy.add_history`. Notebook 06 is refactored to import these.

**Files:**
- Create: `src/pipeline.py`
- Modify: `notebooks/06_strategy_compound.py` (replace inline `build_tables`/`add_history` with imports)
- Test: `tests/test_pipeline.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_pipeline.py
"""Tests for the batch build pipeline (M1).

No fastf1 here: we exercise the pure assembly/persistence seam by monkeypatching
the session-extraction helper, so the test is fast and cache-free.
"""
import pandas as pd

import src.pipeline as pipeline
from src import store


def test_build_all_writes_both_tables(tmp_path, monkeypatch):
    pace = pd.DataFrame({"race_id": ["2023-Bahrain"], "Driver": ["VER"],
                         "race_pace_delta": [0.0], "fp_pace_delta": [0.0],
                         "fp_deg_slope": [0.05], "length_km": [5.4], "n_corners": [15],
                         "abrasiveness": [5], "pit_loss_s": [23.0]})
    strat = pd.DataFrame({"race_id": ["2023-Bahrain"], "Driver": ["VER"], "n_stops": [2]})
    monkeypatch.setattr(pipeline, "build_pace_table", lambda *a, **k: pace)
    monkeypatch.setattr(pipeline, "build_strategy_table", lambda *a, **k: strat)
    pace_path = str(tmp_path / "pace.parquet")
    strat_path = str(tmp_path / "strat.parquet")
    monkeypatch.setattr(store, "PACE_TABLE", pace_path)
    monkeypatch.setattr(store, "STRATEGY_TABLE", strat_path)

    pipeline.build_all()

    pd.testing.assert_frame_equal(store.read_table(pace_path), pace)
    pd.testing.assert_frame_equal(store.read_table(strat_path), strat)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_pipeline.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.pipeline'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/pipeline.py
"""Batch feature-build — the ONLY layer that touches fastf1 + the cache (design §5).

Composes the validated Phase 1 feature functions and persists small parquet
tables via src.store; inference reads those tables and never imports fastf1.
build_strategy_table lifts notebooks/06_strategy_compound.py's session loop
verbatim so the validated +0.07 stop-count result is unchanged.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from src import store
from src.calendar import DRY_CIRCUITS, SEASONS, race_id
from src.data.load import is_dry_session, load_session
from src.features.assemble import build_dataset
from src.features.pace import summarize_stints
from src.features.stints import long_run_stints
from src.features.strategy import (
    add_history,
    count_stops,
    dominant_compound,
    sc_disruption_fraction,
)
from src.features.track import track_features

logger = logging.getLogger(__name__)


def build_pace_table(seasons: list[int] = SEASONS,
                     circuits: list[str] = DRY_CIRCUITS) -> pd.DataFrame:
    """Model A feature table over the calendar (wraps the validated build_dataset)."""
    weekends = [(y, gp) for y in seasons for gp in circuits]
    return build_dataset(weekends)


def _track_temp(session) -> float:
    try:
        w = session.weather_data
        return float(w["TrackTemp"].median()) if w is not None and not w.empty else np.nan
    except Exception:  # noqa: BLE001
        return np.nan


def build_strategy_table(seasons: list[int] = SEASONS,
                         circuits: list[str] = DRY_CIRCUITS) -> pd.DataFrame:
    """Per-driver stop-count feature table (Model B). Loads fastf1 (batch only)."""
    driver_rows, race_rows = [], []
    for year in seasons:
        for gp in circuits:
            race = load_session(year, gp, "R")
            if race is None or race.laps.empty:
                continue
            laps = race.laps
            stops = count_stops(laps)
            dom = dominant_compound(laps)
            sc = sc_disruption_fraction(laps)
            modal = int(stops["n_stops"].mode().iloc[0])

            fp = load_session(year, gp, "FP2")
            if fp is None or not is_dry_session(fp):
                continue
            summary = summarize_stints(long_run_stints(fp.laps))
            if summary.empty:
                continue
            deg_by_c = summary.groupby("compound")["slope"].median()
            deg_overall = float(summary["slope"].median())
            feas = int(summary["n_laps"].max())
            temp = _track_temp(fp)
            tf = track_features(gp)

            race_rows.append({
                "race_id": race_id(year, gp), "year": year, "gp": gp,
                "dominant_compound": dom, "modal_stops": modal, "sc_frac": sc,
                "deg_overall": deg_overall, "feas_max_stint": feas, "track_temp": temp,
                "deg_SOFT": deg_by_c.get("SOFT", np.nan),
                "deg_MEDIUM": deg_by_c.get("MEDIUM", np.nan),
                "deg_HARD": deg_by_c.get("HARD", np.nan),
                "pit_loss_s": tf["pit_loss_s"], "abrasiveness": tf["abrasiveness"],
            })
            for _, r in stops.iterrows():
                driver_rows.append({
                    "race_id": race_id(year, gp), "year": year, "gp": gp, "Driver": r["Driver"],
                    "n_stops": int(r["n_stops"]), "sc_frac": sc,
                    "deg_overall": deg_overall, "feas_max_stint": feas, "track_temp": temp,
                    "deg_SOFT": deg_by_c.get("SOFT", np.nan),
                    "deg_MEDIUM": deg_by_c.get("MEDIUM", np.nan),
                    "deg_HARD": deg_by_c.get("HARD", np.nan),
                    "pit_loss_s": tf["pit_loss_s"], "abrasiveness": tf["abrasiveness"],
                })

    driver_df = pd.DataFrame(driver_rows)
    race_df = pd.DataFrame(race_rows)
    if driver_df.empty:
        return driver_df

    # Leakage-safe track-norm history + the same fills the spike used.
    driver_df = add_history(driver_df, race_df)
    global_modal = float(race_df[race_df.year == seasons[0]]["modal_stops"].median())
    driver_df["hist_modal_stops"] = driver_df["hist_modal_stops"].fillna(global_modal)
    for c in ["deg_SOFT", "deg_MEDIUM", "deg_HARD"]:
        driver_df[c] = driver_df[c].fillna(driver_df["deg_overall"])
    driver_df["track_temp"] = driver_df["track_temp"].fillna(driver_df["track_temp"].median())
    return driver_df


def build_all() -> None:
    """Build and persist both feature tables to the store paths."""
    store.write_table(build_pace_table(), store.PACE_TABLE)
    store.write_table(build_strategy_table(), store.STRATEGY_TABLE)
    logger.info("Wrote %s and %s", store.PACE_TABLE, store.STRATEGY_TABLE)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_pipeline.py -v`
Expected: PASS (1 test)

- [ ] **Step 5: Refactor notebook 06 to use the shared code**

In `notebooks/06_strategy_compound.py`: delete the inline `build_tables` and `add_history` definitions, and replace the imports/usage. Change the import block to add:

```python
from src.pipeline import build_strategy_table
from src.features.strategy import add_history  # noqa: F401 (kept for any direct use)
```

Then in `main()`, replace the table-building + fill prep:

```python
    driver_df, race_df = build_tables()
    ...
    driver_df = add_history(driver_df, race_df)
    global_modal = float(race_df[race_df.year == 2023]["modal_stops"].median())
    driver_df["hist_modal_stops"] = driver_df["hist_modal_stops"].fillna(global_modal)
    for c in ["deg_SOFT", "deg_MEDIUM", "deg_HARD"]:
        driver_df[c] = driver_df[c].fillna(driver_df["deg_overall"])
    driver_df["track_temp"] = driver_df["track_temp"].fillna(driver_df["track_temp"].median())
```

with:

```python
    driver_df = build_strategy_table()
```

(`build_strategy_table` already returns the prepared per-driver table; `race_df` for the PART 2 compound section is rebuilt locally there from the cached sessions exactly as before — leave PART 2 untouched.)

Note: PART 2 (dominant compound) still needs its own `race_df`. Leave that section's `build_tables`-derived `race_df` logic by keeping a thin local `race_df` rebuild OR, simplest, keep `build_tables` as a local helper used ONLY by PART 2 and have PART 1 use `build_strategy_table()`. Pick the smaller diff: retain `build_tables`/local `race_df` for PART 2, switch PART 1's `driver_df` to `build_strategy_table()`. The goal of this step is that the per-driver strategy assembly is no longer duplicated — PART 1 now sources it from `src/`.

- [ ] **Step 6: Verify notebook 06 still reproduces the validated result**

Run: `python notebooks/06_strategy_compound.py`
Expected: PART 1 prints `Model: track + FP deg` accuracy ≈ **0.711** vs track-norm baseline ≈ **0.641** (Δ ≈ +0.07), matching `handoff.md` §1. If the delta moved, STOP — the refactor changed behavior; reconcile before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/pipeline.py tests/test_pipeline.py notebooks/06_strategy_compound.py
git commit -m "feat: add batch build pipeline; source nb06 strategy table from src"
```

---

### Task 5: `lookup_stat` inference (`src/inference/lookup.py`)

Computed-stat lookups, no ML, no fastf1: pit-loss from curated track features; tyre deg + stint length from the persisted strategy table.

**Files:**
- Create: `src/inference/__init__.py` (empty for now; populated in Task 8)
- Create: `src/inference/lookup.py`
- Test: `tests/test_lookup.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_lookup.py
"""Tests for lookup_stat computed-stat lookups (M1)."""
import pandas as pd
import pytest

from src.inference.lookup import lookup_stat


def _strategy_table():
    return pd.DataFrame(
        {
            "gp": ["Bahrain", "Bahrain", "Spain"],
            "deg_overall": [0.10, 0.20, 0.05],
            "feas_max_stint": [18, 22, 30],
        }
    )


def test_pit_loss_comes_from_curated_track_features():
    out = lookup_stat("pit_loss", "Bahrain")
    assert out["value"] == 23.0
    assert out["units"] == "s"


def test_tyre_deg_is_median_over_circuit_rows():
    out = lookup_stat("tyre_deg", "Bahrain", table=_strategy_table())
    assert out["value"] == 0.15  # median(0.10, 0.20)
    assert out["units"] == "s/lap"


def test_stint_length_is_max_feasible_stint():
    out = lookup_stat("stint_length", "Spain", table=_strategy_table())
    assert out["value"] == 30
    assert out["units"] == "laps"


def test_unknown_circuit_returns_none_value():
    out = lookup_stat("tyre_deg", "Imola", table=_strategy_table())
    assert out["value"] is None


def test_unknown_stat_raises():
    with pytest.raises(ValueError):
        lookup_stat("top_speed", "Bahrain", table=_strategy_table())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_lookup.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.inference'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/inference/__init__.py
```

(empty file — public re-exports are added in Task 8)

```python
# src/inference/lookup.py
"""lookup_stat — computed-stat lookups (design §7). No ML, no fastf1.

pit_loss reads curated track features; tyre_deg / stint_length read the persisted
strategy feature table. Numbers are rounded at the boundary (house rule).
"""
from __future__ import annotations

import pandas as pd

from src import store
from src.features.track import track_features

PIT_LOSS = "pit_loss"
TYRE_DEG = "tyre_deg"
STINT_LENGTH = "stint_length"


def lookup_stat(stat: str, gp: str, table: pd.DataFrame | None = None) -> dict:
    """Return a computed stat for a circuit as a typed, rounded dict."""
    if stat == PIT_LOSS:
        tf = track_features(gp)
        return {"stat": stat, "gp": gp, "value": round(float(tf["pit_loss_s"]), 1),
                "units": "s", "source": "curated track features"}

    if stat not in (TYRE_DEG, STINT_LENGTH):
        raise ValueError(f"unknown stat: {stat!r}")

    table = table if table is not None else store.read_table(store.STRATEGY_TABLE)
    rows = table[table["gp"] == gp]
    if rows.empty:
        return {"stat": stat, "gp": gp, "value": None, "units": None,
                "source": "no FP data for circuit"}

    if stat == TYRE_DEG:
        return {"stat": stat, "gp": gp,
                "value": round(float(rows["deg_overall"].median()), 3),
                "units": "s/lap", "source": "FP long-run Theil-Sen deg"}
    # STINT_LENGTH
    return {"stat": stat, "gp": gp, "value": int(rows["feas_max_stint"].max()),
            "units": "laps", "source": "FP longest clean stint"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_lookup.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/inference/__init__.py src/inference/lookup.py tests/test_lookup.py
git commit -m "feat: add lookup_stat computed-stat inference"
```

---

### Task 6: Pace-gap inference (`src/inference/pace.py`)

Model A, demoted: per-driver predicted pace delta + uncertainty (std across RF trees). Trains on strictly-prior weekends via the chokepoint. Imports no fastf1 (feature-column lists are declared locally — NOT imported from `assemble`, which pulls fastf1).

**Files:**
- Create: `src/inference/pace.py`
- Test: `tests/test_inference_pace.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_inference_pace.py
"""Tests for predict_pace_gaps (Model A inference, M1)."""
import numpy as np
import pandas as pd

from src.inference.pace import predict_pace_gaps


def _pace_table(n_prior_races=4):
    rng = np.random.default_rng(0)
    rows = []
    circuits = ["Bahrain", "Saudi Arabia", "Spain", "Hungary", "Italy"]
    # prior weekends (2023) + the target (2024-Bahrain)
    for gp in circuits[:n_prior_races]:
        for d in ["VER", "HAM", "LEC", "NOR"]:
            slow = rng.normal(0, 0.3)
            rows.append({"race_id": f"2023-{gp}", "gp": gp, "Driver": d,
                         "fp_pace_delta": slow, "fp_deg_slope": 0.05 + slow * 0.1,
                         "length_km": 5.0, "n_corners": 15, "abrasiveness": 3,
                         "pit_loss_s": 21.0, "race_pace_delta": slow})
    for d, fp in [("VER", -0.4), ("HAM", -0.1), ("LEC", 0.2), ("NOR", 0.3)]:
        rows.append({"race_id": "2024-Bahrain", "gp": "Bahrain", "Driver": d,
                     "fp_pace_delta": fp, "fp_deg_slope": 0.05, "length_km": 5.4,
                     "n_corners": 15, "abrasiveness": 5, "pit_loss_s": 23.0,
                     "race_pace_delta": fp})
    return pd.DataFrame(rows)


def test_predict_pace_gaps_returns_rounded_deltas_and_uncertainty():
    out = predict_pace_gaps(2024, "Bahrain", table=_pace_table())
    assert out["qualitative"] is False
    assert out["n_train_races"] == 4
    assert len(out["drivers"]) == 4
    d0 = out["drivers"][0]
    assert set(d0) == {"driver", "pace_delta_s", "uncertainty_s"}
    # rounded to 3 dp
    assert d0["pace_delta_s"] == round(d0["pace_delta_s"], 3)
    assert d0["uncertainty_s"] >= 0
    # sorted fastest (most negative) first
    deltas = [d["pace_delta_s"] for d in out["drivers"]]
    assert deltas == sorted(deltas)


def test_sparse_prior_returns_qualitative_band():
    out = predict_pace_gaps(2024, "Bahrain", table=_pace_table(n_prior_races=2))
    assert out["qualitative"] is True
    assert out["drivers"] == []


def test_missing_target_row_is_qualitative():
    out = predict_pace_gaps(2025, "Monaco", table=_pace_table())
    assert out["qualitative"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_inference_pace.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.inference.pace'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/inference/pace.py
"""predict_pace_gaps — Model A (demoted): per-driver pace delta + uncertainty.

Reads ONLY the persisted pace feature table (no fastf1) and trains on strictly
prior weekends via store.prior_weekends. Feature-column names are declared here
(NOT imported from src.features.assemble, which imports fastf1) so this module
stays fastf1-free. Uncertainty = std across RandomForest trees — an honest band.
Numbers are rounded at the boundary. (design §5, §7)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from src import store
from src.calendar import race_id
from src.features.track import TRACK_FEATURE_COLS
from src.models.pace_model import default_model_factory

# Pre-race, Friday-usable features only — no grid (quali-derived). Mirrors the
# FP feature names produced by src.features.assemble.build_weekend.
FP_FEATURE_COLS = ["fp_pace_delta", "fp_deg_slope"]
PACE_INFER_COLS = FP_FEATURE_COLS + TRACK_FEATURE_COLS
MIN_TRAIN_RACES = 3  # below this, no honest numeric band (design §7)


def predict_pace_gaps(year: int, gp: str, table: pd.DataFrame | None = None,
                      model_factory=default_model_factory) -> dict:
    """Per-driver predicted race-pace delta (lower = faster) + uncertainty band."""
    table = table if table is not None else store.read_table(store.PACE_TABLE)
    target = table[table["race_id"] == race_id(year, gp)]
    if target.empty:
        return {"year": year, "gp": gp, "qualitative": True,
                "reason": "no feature row for target weekend", "drivers": []}

    prior = store.prior_weekends(table, year, gp)
    n_train = int(prior["race_id"].nunique())
    if n_train < MIN_TRAIN_RACES:
        return {"year": year, "gp": gp, "qualitative": True, "n_train_races": n_train,
                "reason": "too few prior weekends for a calibrated gap", "drivers": []}

    model = model_factory()
    model.fit(prior[PACE_INFER_COLS], prior["race_pace_delta"])
    X = target[PACE_INFER_COLS]
    per_tree = np.stack([est.predict(X) for est in model.estimators_])
    mean = per_tree.mean(axis=0)
    std = per_tree.std(axis=0)

    drivers = [
        {"driver": d, "pace_delta_s": round(float(m), 3), "uncertainty_s": round(float(s), 3)}
        for d, m, s in zip(target["Driver"], mean, std)
    ]
    drivers.sort(key=lambda r: r["pace_delta_s"])
    return {"year": year, "gp": gp, "qualitative": False,
            "n_train_races": n_train, "drivers": drivers}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_inference_pace.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/inference/pace.py tests/test_inference_pace.py
git commit -m "feat: add pace-gap inference (Model A) with per-tree uncertainty"
```

---

### Task 7: Stop-count inference (`src/inference/strategy.py`)

Model B, the validated telemetry edge: per-driver stop count + confidence + an always-attached safety-car caveat. Trains on prior weekends via the chokepoint. No fastf1.

**Files:**
- Create: `src/inference/strategy.py`
- Test: `tests/test_inference_strategy.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_inference_strategy.py
"""Tests for predict_stop_counts (Model B inference, M1)."""
import pandas as pd

from src.inference.strategy import SC_CAVEAT, predict_stop_counts


def _strategy_table():
    rows = []
    circuits = ["Bahrain", "Saudi Arabia", "Spain", "Hungary"]
    # prior 2023 weekends: high-deg -> 2 stops, low-deg -> 1 stop
    for gp, deg, stops in [("Bahrain", 0.25, 2), ("Saudi Arabia", 0.05, 1),
                           ("Spain", 0.22, 2), ("Hungary", 0.06, 1)]:
        for d in ["VER", "HAM", "LEC", "NOR"]:
            rows.append({"race_id": f"2023-{gp}", "gp": gp, "Driver": d, "n_stops": stops,
                         "pit_loss_s": 21.0, "abrasiveness": 3, "track_temp": 35.0,
                         "hist_modal_stops": stops, "deg_overall": deg,
                         "deg_SOFT": deg, "deg_MEDIUM": deg, "deg_HARD": deg,
                         "feas_max_stint": 20})
    # target 2024-Bahrain (high deg)
    for d in ["VER", "HAM", "LEC", "NOR"]:
        rows.append({"race_id": "2024-Bahrain", "gp": "Bahrain", "Driver": d, "n_stops": 2,
                     "pit_loss_s": 23.0, "abrasiveness": 5, "track_temp": 36.0,
                     "hist_modal_stops": 2, "deg_overall": 0.24,
                     "deg_SOFT": 0.24, "deg_MEDIUM": 0.24, "deg_HARD": 0.24,
                     "feas_max_stint": 18})
    return pd.DataFrame(rows)


def test_predict_stop_counts_returns_stops_confidence_and_caveat():
    out = predict_stop_counts(2024, "Bahrain", table=_strategy_table())
    assert out["qualitative"] is False
    assert out["sc_caveat"] == SC_CAVEAT
    assert len(out["drivers"]) == 4
    d0 = out["drivers"][0]
    assert set(d0) == {"driver", "n_stops", "confidence"}
    assert isinstance(d0["n_stops"], int)
    assert 0.0 <= d0["confidence"] <= 1.0
    assert d0["confidence"] == round(d0["confidence"], 3)


def test_sparse_prior_returns_qualitative_band_with_caveat():
    one_race = _strategy_table()
    one_race = one_race[one_race["race_id"].isin(["2023-Bahrain", "2024-Bahrain"])]
    out = predict_stop_counts(2024, "Bahrain", table=one_race)
    assert out["qualitative"] is True
    assert out["sc_caveat"] == SC_CAVEAT
    assert out["drivers"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_inference_strategy.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.inference.strategy'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/inference/strategy.py
"""predict_stop_counts — Model B: per-driver stop count + safety-car caveat.

The validated telemetry edge (+0.07 vs track-norm, handoff.md §1) and the
deg->stops explainer hook. Reads ONLY the persisted strategy feature table (no
fastf1) and trains on strictly prior weekends via store.prior_weekends. The SC
caveat is ALWAYS attached: the edge is measured on a dry / safety-car-clean
backtest, so live accuracy is lower. Numbers rounded at the boundary. (design §7)
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from src import store
from src.calendar import race_id

BASE_TRACK = ["pit_loss_s", "abrasiveness", "track_temp", "hist_modal_stops"]
FP_DEG = ["deg_overall", "deg_SOFT", "deg_MEDIUM", "deg_HARD", "feas_max_stint"]
STRATEGY_FEATURES = BASE_TRACK + FP_DEG
MIN_TRAIN_RACES = 3  # below this, no honest stop-count band (design §7)
SC_CAVEAT = (
    "Stop-count edge is measured on a dry, safety-car-clean backtest; a safety "
    "car can erase or add a stop, so live accuracy is lower."
)


def _classifier():
    """Random Forest, matching the validated Model B spike (nb 06)."""
    return RandomForestClassifier(n_estimators=200, random_state=0)


def predict_stop_counts(year: int, gp: str, table: pd.DataFrame | None = None) -> dict:
    """Per-driver predicted pit-stop count + confidence, with SC uncertainty caveat."""
    table = table if table is not None else store.read_table(store.STRATEGY_TABLE)
    target = table[table["race_id"] == race_id(year, gp)]
    if target.empty:
        return {"year": year, "gp": gp, "qualitative": True,
                "reason": "no feature row for target weekend",
                "sc_caveat": SC_CAVEAT, "drivers": []}

    prior = store.prior_weekends(table, year, gp)
    n_train = int(prior["race_id"].nunique())
    if n_train < MIN_TRAIN_RACES or prior["n_stops"].nunique() < 2:
        return {"year": year, "gp": gp, "qualitative": True, "n_train_races": n_train,
                "reason": "too few prior weekends / classes for a stop-count model",
                "sc_caveat": SC_CAVEAT, "drivers": []}

    clf = _classifier()
    clf.fit(prior[STRATEGY_FEATURES], prior["n_stops"])
    proba = clf.predict_proba(target[STRATEGY_FEATURES])
    classes = clf.classes_
    preds = classes[np.argmax(proba, axis=1)]
    conf = proba.max(axis=1)

    drivers = [
        {"driver": d, "n_stops": int(p), "confidence": round(float(c), 3)}
        for d, p, c in zip(target["Driver"], preds, conf)
    ]
    return {"year": year, "gp": gp, "qualitative": False, "n_train_races": n_train,
            "sc_caveat": SC_CAVEAT, "drivers": drivers}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_inference_strategy.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/inference/strategy.py tests/test_inference_strategy.py
git commit -m "feat: add stop-count strategy inference (Model B) with SC caveat"
```

---

### Task 8: Public inference surface + fastf1-free guarantee

Re-export the three callables from `src/inference/__init__.py`, and add the load-bearing test that proves importing the inference package does NOT import fastf1 (design §5). Then run the full suite.

**Files:**
- Modify: `src/inference/__init__.py`
- Test: `tests/test_inference_no_fastf1.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_inference_no_fastf1.py
"""Design §5 guarantee: importing the inference package must not import fastf1.

This is what keeps the eventual /api/ serverless functions free of fastf1 and the
~225M cache — they ship only the small feature table.
"""
import importlib
import sys


def test_importing_inference_does_not_import_fastf1():
    # Drop any prior import of fastf1 and the inference modules, then re-import.
    for name in list(sys.modules):
        if name == "fastf1" or name.startswith("fastf1."):
            del sys.modules[name]
    for name in ["src.inference", "src.inference.lookup",
                 "src.inference.pace", "src.inference.strategy"]:
        sys.modules.pop(name, None)

    importlib.import_module("src.inference")

    leaked = [m for m in sys.modules if m == "fastf1" or m.startswith("fastf1.")]
    assert leaked == [], f"inference pulled in fastf1: {leaked}"


def test_public_callables_are_exported():
    import src.inference as inf
    assert hasattr(inf, "lookup_stat")
    assert hasattr(inf, "predict_pace_gaps")
    assert hasattr(inf, "predict_stop_counts")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_inference_no_fastf1.py -v`
Expected: FAIL — `test_public_callables_are_exported` fails (no exports yet) and the import-guard may fail if anything leaks.

- [ ] **Step 3: Write minimal implementation**

```python
# src/inference/__init__.py
"""Public inference surface (M1). Imports here must stay fastf1-free (design §5)."""
from src.inference.lookup import lookup_stat
from src.inference.pace import predict_pace_gaps
from src.inference.strategy import predict_stop_counts

__all__ = ["lookup_stat", "predict_pace_gaps", "predict_stop_counts"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_inference_no_fastf1.py -v`
Expected: PASS (2 tests). If `test_importing_inference_does_not_import_fastf1` fails, an inference module is importing a fastf1-backed module (e.g. `src.features.assemble` or `src.data.load`) — replace that import with a fastf1-free equivalent (local constant or `src.features.track`).

- [ ] **Step 5: Run the FULL suite — nothing regressed**

Run: `python -m pytest -q`
Expected: all tests pass — the original 51 plus the new tests (calendar, store, strategy additions, pipeline, lookup, pace, strategy inference, no-fastf1 guard).

- [ ] **Step 6: Commit**

```bash
git add src/inference/__init__.py tests/test_inference_no_fastf1.py
git commit -m "feat: expose public inference surface; guard fastf1-free imports"
```

---

## Final verification (M1 Definition of Done)

- [ ] `python -m pytest -q` is green (original 51 + new tests).
- [ ] `python notebooks/06_strategy_compound.py` still prints the +0.07 stop-count edge (Task 4 Step 6).
- [ ] `from src.inference import lookup_stat, predict_pace_gaps, predict_stop_counts` works and imports no fastf1.
- [ ] `src/pipeline.py:build_all()` is the only path that touches fastf1/cache and writes both parquet tables.
- [ ] Spec DoD §11 checklist items all satisfied.

## Spec coverage map

| Spec section | Task(s) |
|---|---|
| §4 module layout | 1 (calendar), 2 (store), 3 (strategy), 4 (pipeline), 5–8 (inference) |
| §5 inference never imports fastf1 | 6, 7 (local feature cols), 8 (guard test) |
| §6 centralized leakage guard | 1 (calendar order), 2 (prior_weekends + regression test) |
| §7 output contracts (typed, rounded, sparse→qualitative, SC caveat) | 5, 6, 7 |
| §8 caching (parquet store, fastf1 batch-only) | 2, 4 |
| §9 testing (synthetic only, parity guard, leakage test) | every task; nb-06 parity in Task 4 Step 6 |
| §10 known gaps (no lying stubs) | scope — podium/compound absent by design |

## Notes for the executor

- **Run everything from the repo root** (`/Users/ramneek/Downloads/sector4`) so `from src...` resolves and pytest picks up `pytest.ini`.
- **Never call `build_all()` / `build_strategy_table()` / `build_pace_table()` inside unit tests** — they hit fastf1 and the cache. Tests pass synthetic tables via the `table=` argument.
- **Do not retune `MIN_TRAIN_RACES`** or the model hyperparameters in M1 — they mirror the validated Phase 1 settings. Tuning is out of scope.
- If Task 4 Step 6 shows the +0.07 edge moved, treat it as a regression in the refactor, not a new finding — reconcile before proceeding.
