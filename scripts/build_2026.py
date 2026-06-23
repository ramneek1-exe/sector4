"""M5 R8/R17 — refresh the bundled feature tables with live 2026 data.

INCREMENTAL by design: the 2023-25 history (and any already-built 2026 rounds) is read
from the committed tables in api/, and only the LIVE season (2026) is fetched from fastf1
and merged in. This is what lets the refresh run in CI (GitHub Actions has no warm fastf1
cache, and fastf1 cannot fetch *old* sessions fresh — only recent ones), and it is much
faster locally too.

Telemetry (pace/stop-count) for the upcoming weekend lights up automatically once that
weekend's FP has run and this refresh picks up its rows. Podium is unaffected by the
strategy/pace tables.

Run:  PYTHONPATH=. python scripts/build_2026.py
(then the api/ copies happen automatically at the end.)

NOTE: for the live weekend, the strategy table's cross-season `hist_modal_stops` is
derived from the live season only (a minor feature approximation for the supporting,
caveated stop-count card). Refine later if needed; the podium headline does not use it.
"""
from __future__ import annotations

import logging
import os
import shutil

import pandas as pd

from src import store
from src.calendar import RACE_CALENDAR
from src.data.results import load_results
from src.pipeline import (
    build_pace_table,
    build_pit_loss,
    build_podium_table,
    build_strategy_table,
    build_team_map,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")

LIVE_SEASON = 2026
SEASONS = [2023, 2024, 2025, 2026]
LIVE_CIRCUITS = RACE_CALENDAR[LIVE_SEASON]  # only the live season's circuits are fetched
API_DIR, DATA_DIR = "api", "data"
TABLES = [
    "pace_features.parquet",
    "strategy_features.parquet",
    "team_map.parquet",
    "season_results.parquet",
    "podium_features.parquet",
    "pit_loss.parquet",
]


def _seed_data_from_api() -> None:
    """Copy committed api/ tables into data/ so history is reused, not re-fetched."""
    os.makedirs(DATA_DIR, exist_ok=True)
    for t in TABLES:
        dst, src = os.path.join(DATA_DIR, t), os.path.join(API_DIR, t)
        if not os.path.exists(dst) and os.path.exists(src):
            shutil.copy(src, dst)
            print(f"  seeded {dst} from {src}")


def _merge_live(base_path: str, fresh: pd.DataFrame) -> pd.DataFrame:
    """Replace the LIVE_SEASON rows in the committed base table with freshly-built ones."""
    base = pd.read_parquet(base_path) if os.path.exists(base_path) else pd.DataFrame()
    if not base.empty and "year" in base:
        base = base[base["year"] != LIVE_SEASON]
    frames = [df for df in (base, fresh) if df is not None and not df.empty]
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def main() -> None:
    _seed_data_from_api()

    print(f"1/6 season_results — refresh {LIVE_SEASON}, reuse cached history...")
    results = load_results(SEASONS, refresh_year=LIVE_SEASON)
    store.write_table(results, store.SEASON_RESULTS)
    print(f"    {len(results)} rows, years {sorted(results['year'].unique())}")

    print(f"2/6 pace — fetch {LIVE_SEASON} only, merge with committed history...")
    pace = _merge_live(store.PACE_TABLE, build_pace_table([LIVE_SEASON], LIVE_CIRCUITS))
    store.write_table(pace, store.PACE_TABLE)
    print(f"    {len(pace)} rows, {pace['race_id'].nunique()} weekends")

    print(f"3/6 strategy — fetch {LIVE_SEASON} only, merge...")
    strat = _merge_live(store.STRATEGY_TABLE,
                        build_strategy_table([LIVE_SEASON], LIVE_CIRCUITS))
    store.write_table(strat, store.STRATEGY_TABLE)
    print(f"    {len(strat)} rows, {strat['race_id'].nunique()} weekends")

    print(f"4/6 pit-loss — fetch {LIVE_SEASON} only, merge...")
    pit = _merge_live(store.PIT_LOSS, build_pit_loss([LIVE_SEASON], LIVE_CIRCUITS))
    store.write_table(pit, store.PIT_LOSS)
    print(f"    {len(pit)} rows, {pit['gp'].nunique()} circuits")

    print("5/6 podium table (pure transform)...")
    store.write_table(build_podium_table(pace, results), store.PODIUM_TABLE)
    print("6/6 team map (pure transform)...")
    store.write_table(build_team_map(results), store.TEAM_MAP)

    for t in TABLES:
        shutil.copy(os.path.join(DATA_DIR, t), os.path.join(API_DIR, t))
    print("DONE — feature tables refreshed and copied into api/.")


if __name__ == "__main__":
    main()
