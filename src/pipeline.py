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
from src.calendar import DRY_CIRCUITS, GP_TO_EVENT, SEASONS, race_id
from src.data.load import is_dry_session, load_session
from src.features.assemble import build_dataset
from src.features.friday import add_friday_features, prior_track_pace
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
    """Per-driver stop-count feature table (Model B). Loads fastf1 (batch only).

    `seasons` must be in ascending calendar order: seasons[0] is treated as the
    earliest season and is used as the baseline for hist_modal_stops imputation.
    """
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


def build_all() -> None:
    """Build and persist both feature tables to the store paths."""
    store.write_table(build_pace_table(), store.PACE_TABLE)
    store.write_table(build_strategy_table(), store.STRATEGY_TABLE)
    logger.info("Wrote %s and %s", store.PACE_TABLE, store.STRATEGY_TABLE)
