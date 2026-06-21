"""M5 R8 — build & bundle the 2026 feature tables for the live beta.

Heavy fastf1 batch (network + time): fetches FP + race sessions across seasons. Run
LOCALLY (not in CI/serverless). Builds the historical/training tables + season results
that the runtime podium reads; the upcoming Austria TARGET row is constructed at request
time (src/inference/upcoming.py), so a not-yet-run weekend correctly produces no table
row here.

Run:  PYTHONPATH=. .venv/bin/python scripts/build_2026.py
Then the printed `cp` line copies the tables into api/ for the serverless fns.
"""
from __future__ import annotations

import logging

from src import store
from src.calendar import DRY_CIRCUITS, RACE_CALENDAR
from src.data.results import load_results
from src.pipeline import (
    build_pace_table,
    build_podium_table,
    build_strategy_table,
    build_team_map,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")

SEASONS = [2023, 2024, 2025, 2026]
# Dry validation set + every 2026 calendar circuit built so far (gives Austria its
# prior-year track pace and the 2026 rounds their training rows).
CIRCUITS = sorted(set(DRY_CIRCUITS) | {gp for c in RACE_CALENDAR.values() for gp in c})


def main() -> None:
    print(f"Seasons: {SEASONS}\nCircuits ({len(CIRCUITS)}): {CIRCUITS}\n")

    print("1/5 season_results (light; refreshing 2026 live season)...")
    results = load_results(SEASONS, refresh_year=2026)
    store.write_table(results, store.SEASON_RESULTS)
    print(f"    {len(results)} rows, years {sorted(results['year'].unique())}")

    print("2/5 pace table (FP + race per weekend)...")
    pace = build_pace_table(SEASONS, CIRCUITS)
    store.write_table(pace, store.PACE_TABLE)
    print(f"    {len(pace)} rows, {pace['race_id'].nunique()} weekends")

    print("3/5 strategy table...")
    strategy = build_strategy_table(SEASONS, CIRCUITS)
    store.write_table(strategy, store.STRATEGY_TABLE)
    print(f"    {len(strategy)} rows, {strategy['race_id'].nunique()} weekends")

    print("4/5 podium table (Friday features + prior-track-pace)...")
    podium = build_podium_table(pace, results)
    store.write_table(podium, store.PODIUM_TABLE)
    print(f"    {len(podium)} rows")

    print("5/5 team map...")
    store.write_table(build_team_map(results), store.TEAM_MAP)

    print("\nDONE. Now copy into api/ for the serverless fns:")
    print("  cp data/pace_features.parquet data/strategy_features.parquet "
          "data/team_map.parquet data/season_results.parquet api/")
    print("  cp data/podium_features.parquet api/podium_features.parquet")


if __name__ == "__main__":
    main()
