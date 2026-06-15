"""Friday-information-state features: standings, recent form, track history.

Sector 4's signature window (PRD §7.3) is Friday -> pre-quali, when grid does NOT
yet exist. These features capture what IS knowable on Friday, computed strictly
from races prior in time to the one being predicted (leakage discipline).

  - champ_points_before / champ_rank_before: current-season standings before this race
  - form_finish_avg3: trailing-N-race average finishing position (crosses seasons)
  - track_hist_finish: driver's average finish at this circuit in prior years

All are pre-race signals; none use grid, qualifying, or the target race.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

NEUTRAL_POS = 10.5  # mid-grid impute for missing form / track history / round-1 rank


def standings_before(results: pd.DataFrame, year: int, before_date) -> dict[str, float]:
    """Championship points per driver from same-season races strictly before date."""
    mask = (results["year"] == year) & (results["date"] < before_date)
    return results.loc[mask].groupby("Driver")["points"].sum().to_dict()


def constructor_standings_before(results: pd.DataFrame, year: int, before_date) -> dict[str, float]:
    """Constructor championship points per team from same-season races before date."""
    mask = (results["year"] == year) & (results["date"] < before_date)
    return results.loc[mask].groupby("team")["points"].sum().to_dict()


def rank_from_points(points: dict[str, float]) -> dict[str, int]:
    """Driver -> championship rank (1 = most points)."""
    ordered = sorted(points.items(), key=lambda kv: kv[1], reverse=True)
    return {drv: i + 1 for i, (drv, _) in enumerate(ordered)}


def trailing_finish_avg(results: pd.DataFrame, driver: str, before_date, n: int = 3) -> float:
    """Mean finishing position of a driver's most recent n races before date.

    Crosses season boundaries (form carries into a new season). NaN if the driver
    has no prior races at all.
    """
    prior = results[(results["Driver"] == driver) & (results["date"] < before_date)]
    if prior.empty:
        return float("nan")
    recent = prior.sort_values("date").tail(n)
    return float(recent["finish_pos"].mean())


def track_history_finish(results: pd.DataFrame, event: str, driver: str, before_date) -> float:
    """Mean finishing position of a driver at this circuit in prior years. NaN if none."""
    mask = (
        (results["gp"] == event)
        & (results["Driver"] == driver)
        & (results["date"] < before_date)
    )
    prior = results.loc[mask]
    if prior.empty:
        return float("nan")
    return float(prior["finish_pos"].mean())


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


def add_friday_features(
    feature_df: pd.DataFrame,
    results: pd.DataFrame,
    gp_to_event: dict[str, str],
    n_form: int = 3,
) -> pd.DataFrame:
    """Attach Friday features to a per-driver-per-weekend feature table.

    `gp_to_event` maps the feature table's gp keys (e.g. "Spain") to the results
    EventName (e.g. "Spanish Grand Prix") so track history matches the right
    circuit. Standings/form use all results and need no mapping.
    """
    out = feature_df.copy()
    # Precompute per (year, gp): the race date and the season standings before it.
    cache: dict[tuple, tuple] = {}
    for year, gp in out[["year", "gp"]].drop_duplicates().itertuples(index=False):
        event = gp_to_event.get(gp, gp)
        m = (results["year"] == year) & (results["gp"] == event)
        if not m.any():
            cache[(year, gp)] = (None, {}, {})
            continue
        bd = results.loc[m, "date"].iloc[0]
        pts = standings_before(results, year, bd)
        cache[(year, gp)] = (bd, pts, rank_from_points(pts))

    points, ranks, forms, hist = [], [], [], []
    for year, gp, drv in out[["year", "gp", "Driver"]].itertuples(index=False):
        bd, pts, rnk = cache[(year, gp)]
        event = gp_to_event.get(gp, gp)
        if bd is None:
            points.append(np.nan); ranks.append(np.nan); forms.append(np.nan); hist.append(np.nan)
            continue
        points.append(pts.get(drv, 0.0))
        ranks.append(rnk.get(drv, np.nan))  # absent (round 1, zero points) -> NaN
        forms.append(trailing_finish_avg(results, drv, bd, n_form))
        hist.append(track_history_finish(results, event, drv, bd))

    out["champ_points_before"] = points
    out["champ_rank_before"] = ranks
    out["form_finish_avg3"] = forms
    out["track_hist_finish"] = hist
    return out
