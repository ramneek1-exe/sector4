"""Upcoming-weekend target-row builder (M5 R10).

The backtest pipeline (build_pace_table -> build_podium_table) derives a weekend's
row from COMPLETED sessions (race pace + finish + grid), so it cannot produce a row
for a FUTURE weekend. This module constructs the podium TARGET feature row for an
upcoming race from pre-race signals only — standings/form (season results so far),
prior-year track pace (history), and the grid (known only after qualifying). It is the
"issue before quali (grid=None -> Friday mode), sharpen after (grid filled -> Saturday)"
mechanism.

Pure pandas; reuses src.features.friday + src.calendar. No fastf1.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from src.calendar import GP_TO_EVENT, race_id
from src.features.friday import (
    NEUTRAL_POS,
    prior_track_pace,
    rank_from_points,
    standings_before,
    trailing_finish_avg,
)
from src.inference.podium import predict_podium


def build_podium_target(
    season_results: pd.DataFrame,
    pace_hist: pd.DataFrame,
    year: int,
    gp: str,
    entry_drivers: list[str],
    grid: dict[str, int] | None = None,
    before_date: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """One podium feature row per entry driver for an upcoming (future) weekend.

    Columns match what predict_podium reads: race_id, year, gp, Driver,
    champ_points_before, champ_rank_before, form_finish_avg3, prior_track_pace,
    grid_position (NaN pre-quali), team. Missing signals are imputed exactly as
    build_podium_table does so the model never sees NaN.

    `before_date` defaults to just after the latest completed round in `year`, so every
    race run so far this season counts toward standings/form. `grid` maps Driver ->
    grid position; omit it (None) for the pre-quali Friday issue.
    """
    if before_date is None:
        same_year = season_results[season_results["year"] == year]
        latest = (same_year if not same_year.empty else season_results)["date"].max()
        before_date = latest + pd.Timedelta(days=1)

    pts = standings_before(season_results, year, before_date)
    ranks = rank_from_points(pts)

    # Year-correct team = each driver's most recent team in the results so far.
    team_by_driver = (
        season_results.sort_values("date")
        .groupby("Driver")["team"].last().to_dict()
    )

    rows = []
    for drv in entry_drivers:
        g = grid.get(drv) if grid else np.nan
        rows.append({
            "race_id": race_id(year, gp), "year": year, "gp": gp, "Driver": drv,
            "champ_points_before": pts.get(drv, np.nan),
            "champ_rank_before": ranks.get(drv, np.nan),
            "form_finish_avg3": trailing_finish_avg(season_results, drv, before_date, 3),
            "prior_track_pace": prior_track_pace(pace_hist, gp, drv, year),
            "grid_position": g,
            "team": team_by_driver.get(drv),
        })
    df = pd.DataFrame(rows)

    # Impute identically to build_podium_table (Friday-state missingness).
    df["champ_points_before"] = df["champ_points_before"].fillna(0.0)
    df["champ_rank_before"] = df["champ_rank_before"].fillna(NEUTRAL_POS)
    df["form_finish_avg3"] = df["form_finish_avg3"].fillna(NEUTRAL_POS)
    df["prior_track_pace"] = df["prior_track_pace"].fillna(0.0)
    return df


def latest_entry_list(season_results: pd.DataFrame, year: int) -> list[str]:
    """Drivers in the most recent completed round of `year` (the entry list proxy)."""
    sy = season_results[season_results["year"] == year]
    if sy.empty:
        return []
    last_date = sy["date"].max()
    return sy[sy["date"] == last_date]["Driver"].tolist()


def predict_upcoming_podium(
    history: pd.DataFrame,
    season_results: pd.DataFrame,
    pace_hist: pd.DataFrame,
    year: int,
    gp: str,
    grid: dict[str, int] | None = None,
    entry_drivers: list[str] | None = None,
    mode: str = "auto",
) -> dict:
    """Predict an UPCOMING weekend's podium by constructing its target row at runtime.

    Appends the built target row to the bundled `history` table and runs the existing
    predict_podium (which trains on strictly-prior weekends via the leakage chokepoint).
    `grid=None` -> Friday mode (pre-quali); a grid map -> Saturday (sharpened). Defaults
    the entry list to the latest completed round when not given.
    """
    if entry_drivers is None:
        entry_drivers = latest_entry_list(season_results, year)
    target = build_podium_target(season_results, pace_hist, year, gp, entry_drivers, grid)
    table = pd.concat([history, target], ignore_index=True)
    return predict_podium(year, gp, mode=mode, table=table)
