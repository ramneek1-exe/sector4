"""Per-stint pace modelling and corrections (spike Steps 2-3, PRD §7.2).

The output of interest is a compound-normalized, fuel/deg-corrected,
track-evolution-adjusted clean pace per stint. Raw FP averages are not
predictive; this is the feature that is.

Pace convention everywhere: seconds/lap, LOWER = FASTER.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import theilslopes


def fit_stint_pace(lap_in_stint, lap_seconds, robust: bool = False) -> tuple[float, float]:
    """Linear fit of lap time vs lap-position-in-stint.

    Returns (slope, intercept). The slope is the NET of tyre degradation
    (pushes times up) and fuel burn (pulls times down); intercept is the
    extrapolated clean pace at stint start (lap position 0).

    robust=True uses the Theil-Sen estimator (median of pairwise slopes), which
    shrugs off the odd traffic/lock-up lap the 107% filter misses on a long
    stint — OLS gets dragged off by a single outlier. Theil-Sen needs >=2 unique
    x; below that it falls back to OLS.
    """
    x = np.asarray(lap_in_stint, dtype=float)
    y = np.asarray(lap_seconds, dtype=float)
    if robust and len(np.unique(x)) >= 2:
        slope, intercept, _, _ = theilslopes(y, x)
        return float(slope), float(intercept)
    slope, intercept = np.polyfit(x, y, 1)
    return float(slope), float(intercept)


def summarize_stints(long_run_laps: pd.DataFrame, robust: bool = True) -> pd.DataFrame:
    """One row per stint: slope, intercept, median pace, lap count, metadata.

    robust defaults to True: deg slopes are fit with Theil-Sen so a stray lap
    can't produce the physically-impossible (±10 s/lap) slopes seen with OLS.
    """
    rows = []
    for stint_id, grp in long_run_laps.groupby("StintId", sort=False):
        slope, intercept = fit_stint_pace(grp["LapInStint"], grp["LapTimeSeconds"], robust=robust)
        rows.append(
            {
                "StintId": stint_id,
                "Driver": grp["Driver"].iloc[0],
                "compound": grp["Compound"].iloc[0],
                "n_laps": len(grp),
                "slope": slope,
                "intercept": intercept,
                "median_pace": float(grp["LapTimeSeconds"].median()),
            }
        )
    return pd.DataFrame(rows)


def compute_compound_offsets(
    stint_summary: pd.DataFrame, reference: str = "MEDIUM"
) -> dict[str, float]:
    """Per-compound offset to convert a stint's pace to reference-compound pace.

    offset[c] = median_pace(reference) - median_pace(c). Adding it to a stint's
    pace removes the compound advantage (soft -> +offset slower, hard -> faster).
    Computed from TRAINING stints only to avoid leakage.
    """
    by_compound = stint_summary.groupby("compound")["median_pace"].median()
    ref_pace = by_compound.get(reference)
    if ref_pace is None:  # reference compound absent: anchor to the field median
        ref_pace = by_compound.median()
    return {c: float(ref_pace - p) for c, p in by_compound.items()}


def normalize_compound(
    stint_summary: pd.DataFrame, offsets: dict[str, float]
) -> pd.DataFrame:
    """Add `pace_compound_norm` = median_pace + per-compound offset.

    Compounds with no known offset (unseen in training) get 0 — a conservative
    no-op rather than a guess.
    """
    out = stint_summary.copy()
    out["pace_compound_norm"] = out["median_pace"] + out["compound"].map(
        offsets
    ).fillna(0.0)
    return out


def session_evolution_slope(times, paces) -> float:
    """Slope (s/lap per unit session-time) of the field-wide pace trend.

    Negative = track rubbering in (getting faster) over the session.
    """
    x = np.asarray(times, dtype=float)
    y = np.asarray(paces, dtype=float)
    slope, _ = np.polyfit(x, y, 1)
    return float(slope)


def evolution_adjust(paces, times, slope: float, t_ref: float):
    """Remove the track-evolution trend, referencing all stints to t_ref.

    A stint that ran late (on a faster track) gets its pace nudged back toward
    the reference track state, so stints are compared on equal footing.
    """
    paces = np.asarray(paces, dtype=float)
    times = np.asarray(times, dtype=float)
    return paces - slope * (times - t_ref)
