"""Assemble the Model A feature table (spike Step 5, PRD §7.2).

One row per driver per race weekend:
  features = engineered FP long-run pace delta + deg slope + grid position
             + track-intrinsic features
  target   = actual race pace delta (median clean green-flag lap vs field median)

Leakage guard (CLAUDE.md): nothing race-derived may be an input feature. The
only pre-race signal we take from the race session is grid position; race lap
times feed the TARGET only.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from src.data.load import is_dry_session, load_session
from src.features.pace import (
    compute_compound_offsets,
    evolution_adjust,
    normalize_compound,
    session_evolution_slope,
    summarize_stints,
)
from src.features.stints import filter_green_laps, long_run_stints
from src.features.track import TRACK_FEATURE_COLS, track_features

logger = logging.getLogger(__name__)

# Feature columns the model trains on (all pre-race / transferable).
FP_FEATURE_COLS = ["fp_pace_delta", "fp_deg_slope"]
MODEL_FEATURE_COLS = FP_FEATURE_COLS + ["grid_position"] + TRACK_FEATURE_COLS

MIN_RACE_LAPS = 5  # need enough clean race laps to trust a driver's race pace


def _lap_start_seconds(laps: pd.DataFrame) -> pd.Series:
    """Session-time of each lap in seconds, for the evolution correction."""
    t = laps["LapStartTime"]
    if t.isna().all() and "Time" in laps:
        t = laps["Time"]
    return t.dt.total_seconds()


def build_fp_features(session) -> pd.DataFrame:
    """Per-driver engineered FP long-run pace (Steps 1-3).

    Returns columns: Driver, fp_pace_norm (compound+evolution corrected, lower =
    faster), fp_deg_slope. Empty frame if the session has no usable long runs.
    """
    laps = session.laps
    long_laps = long_run_stints(laps)
    if long_laps.empty:
        return pd.DataFrame(columns=["Driver", "fp_pace_norm", "fp_deg_slope"])

    long_laps = long_laps.copy()
    long_laps["LapStartSeconds"] = _lap_start_seconds(long_laps)

    summary = summarize_stints(long_laps)

    # Track-evolution correction: fit the field-wide pace trend over the session
    # and reference every stint back to the median session time.
    times = long_laps["LapStartSeconds"]
    valid = times.notna()
    if valid.sum() >= 2:
        evo_slope = session_evolution_slope(
            times[valid], long_laps.loc[valid, "LapTimeSeconds"]
        )
        t_ref = float(times[valid].median())
        stint_time = long_laps.groupby("StintId")["LapStartSeconds"].median()
        summary = summary.merge(
            stint_time.rename("stint_time"), left_on="StintId", right_index=True
        )
        summary["pace_evo"] = evolution_adjust(
            summary["median_pace"].to_numpy(),
            summary["stint_time"].fillna(t_ref).to_numpy(),
            evo_slope,
            t_ref,
        )
    else:
        summary["pace_evo"] = summary["median_pace"]

    # Compound normalization on the evolution-adjusted pace (within-session
    # offsets for the spike; production uses historical per-track offsets).
    norm_input = summary.assign(median_pace=summary["pace_evo"])
    offsets = compute_compound_offsets(norm_input)
    summary["pace_compound_norm"] = normalize_compound(norm_input, offsets)["pace_compound_norm"]

    # One row per driver: their LONGEST corrected long run (the genuine race-sim
    # run) + its deg slope. Longest, not fastest: the fastest stint is usually a
    # short low-fuel quali sim, which misrepresents race pace and yields unstable
    # slope fits. Ties broken toward the faster stint.
    rep = (
        summary.sort_values(["n_laps", "pace_compound_norm"], ascending=[False, True])
        .groupby("Driver", as_index=False)
        .first()
    )
    # Guard the slope: a real net deg+fuel slope is small; clip residual artifacts
    # from imperfect fits so a few bad stints can't dominate the feature.
    rep["slope"] = rep["slope"].clip(-0.5, 1.0)
    return rep[["Driver", "pace_compound_norm", "slope"]].rename(
        columns={"pace_compound_norm": "fp_pace_norm", "slope": "fp_deg_slope"}
    )


def build_race_target(race_session) -> pd.DataFrame:
    """Per-driver race target + grid position (Step 5).

    race_pace_delta = (driver median clean green lap) - (field median), lower =
    faster. Drivers with < MIN_RACE_LAPS clean laps are dropped (unreliable
    target, usually heavy DNFs).
    """
    laps = race_session.laps
    clean = filter_green_laps(laps).copy()
    clean["LapTimeSeconds"] = clean["LapTime"].dt.total_seconds()

    per_driver = clean.groupby("Driver").agg(
        median_pace=("LapTimeSeconds", "median"),
        n_laps=("LapTimeSeconds", "size"),
    )
    per_driver = per_driver[per_driver["n_laps"] >= MIN_RACE_LAPS]
    if per_driver.empty:
        return pd.DataFrame(columns=["Driver", "race_pace_delta", "grid_position", "finish_pos"])

    field_median = per_driver["median_pace"].median()
    per_driver["race_pace_delta"] = per_driver["median_pace"] - field_median

    results = race_session.results[["Abbreviation", "GridPosition", "Position"]].rename(
        columns={"Abbreviation": "Driver", "GridPosition": "grid_position", "Position": "finish_pos"}
    )
    out = per_driver.reset_index().merge(results, on="Driver", how="inner")
    # Pit-lane starts are recorded as grid 0; treat as back of grid.
    out["grid_position"] = out["grid_position"].replace(0, out["grid_position"].max() + 1)
    out = out.dropna(subset=["grid_position", "finish_pos"])
    return out[["Driver", "race_pace_delta", "grid_position", "finish_pos"]]


def build_weekend(year: int, gp: str) -> pd.DataFrame | None:
    """Build the per-driver feature rows for one weekend (FP2, FP1 fallback).

    Returns None if the weekend is unusable (no dry FP long runs or no race
    target). Adds race_id, year, gp, fp_source, and the fp_pace_delta target-
    free feature (FP pace as a within-session delta vs the field median).
    """
    race = load_session(year, gp, "R")
    if race is None:
        logger.warning("No race session for %s %s", year, gp)
        return None
    target = build_race_target(race)
    if target.empty:
        return None

    fp_source = None
    fp_feats = pd.DataFrame()
    for sess_name in ("FP2", "FP1"):
        sess = load_session(year, gp, sess_name)
        if sess is None or not is_dry_session(sess):
            continue
        feats = build_fp_features(sess)
        if not feats.empty:
            fp_feats, fp_source = feats, sess_name
            break
    if fp_feats.empty:
        logger.warning("No usable FP long runs for %s %s", year, gp)
        return None

    # FP pace as a within-session delta vs field median (lower = faster).
    fp_feats = fp_feats.copy()
    fp_feats["fp_pace_delta"] = fp_feats["fp_pace_norm"] - fp_feats["fp_pace_norm"].median()

    df = fp_feats.merge(target, on="Driver", how="inner")
    if df.empty:
        return None

    for col, val in track_features(gp).items():
        df[col] = val
    df["year"] = year
    df["gp"] = gp
    df["race_id"] = f"{year}-{gp}"
    df["fp_source"] = fp_source
    return df


def build_dataset(weekends: list[tuple[int, str]]) -> pd.DataFrame:
    """Build the full feature table over a list of (year, gp), chronologically.

    Weekends are assumed passed in calendar order; race_id ordering drives the
    rolling-origin CV.
    """
    frames = []
    for year, gp in weekends:
        wk = build_weekend(year, gp)
        if wk is not None and not wk.empty:
            frames.append(wk)
            logger.info("Built %s %s: %d drivers (%s)", year, gp, len(wk), wk["fp_source"].iloc[0])
        else:
            logger.warning("Skipped %s %s (unusable)", year, gp)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)
