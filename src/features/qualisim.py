"""Quali-sim (low-fuel single-lap) pace extraction.

Hypothesis: quali-sim pace predicts the GRID far better than long-run pace
predicts the race, because it's like-for-like (one fast lap -> one fast lap).

A quali sim is a driver's fastest clean flying lap in practice (low fuel, soft
tyre, run late in the session). Robust proxy: the fastest lap per driver that is
accurate, green-flag, not deleted, and not an in/out lap. The session's fastest
lap is essentially always a quali-sim lap, so the per-driver minimum clean lap is
a sound proxy without hand-labelling run patterns.
"""
from __future__ import annotations

import pandas as pd

GREEN = "1"


def _clean_flying_laps(laps: pd.DataFrame) -> pd.DataFrame:
    mask = (
        laps["LapTime"].notna()
        & (laps["Deleted"] != True)  # noqa: E712
        & (laps["TrackStatus"].astype(str) == GREEN)
        & laps["PitInTime"].isna()
        & laps["PitOutTime"].isna()
        & (laps["IsAccurate"] == True)  # noqa: E712 - flying lap must be a clean, valid lap
    )
    out = laps.loc[mask].copy()
    out["LapTimeSeconds"] = out["LapTime"].dt.total_seconds()
    return out


def best_qualisim_pace(laps: pd.DataFrame) -> pd.DataFrame:
    """Per-driver fastest clean flying lap (seconds). Drivers with no clean lap drop out."""
    clean = _clean_flying_laps(laps)
    if clean.empty:
        return pd.DataFrame(columns=["Driver", "qsim_seconds"])
    best = clean.groupby("Driver", as_index=False)["LapTimeSeconds"].min()
    return best.rename(columns={"LapTimeSeconds": "qsim_seconds"})


def qualisim_delta(laps: pd.DataFrame) -> pd.DataFrame:
    """Per-driver quali-sim pace as a delta to the session best (lower = faster)."""
    best = best_qualisim_pace(laps)
    if best.empty:
        return best.assign(qsim_delta=pd.Series(dtype="float"))
    best["qsim_delta"] = best["qsim_seconds"] - best["qsim_seconds"].min()
    return best


def quali_target_from_results(results: pd.DataFrame) -> pd.DataFrame:
    """Build the qualifying target from Q-session results.

    Returns Driver, quali_pos (classification, 1 = pole), pole_gap (driver's best
    Q1/Q2/Q3 time minus the fastest overall, in seconds). Drivers who set no time
    are dropped. This is the cleaner grid target — qualifying order, before the
    grid penalties that muddy race-result GridPosition.
    """
    q_cols = [c for c in ("Q1", "Q2", "Q3") if c in results.columns]
    secs = results[q_cols].apply(
        lambda col: pd.to_timedelta(col.astype(object), errors="coerce").dt.total_seconds()
    )
    best_time = secs.min(axis=1)  # NaT-safe: min ignores NaN
    out = pd.DataFrame(
        {
            "Driver": results["Abbreviation"],
            "quali_pos": results["Position"],
            "best_time": best_time,
        }
    ).dropna(subset=["best_time"])
    out["pole_gap"] = out["best_time"] - out["best_time"].min()
    return out[["Driver", "quali_pos", "pole_gap"]].reset_index(drop=True)
