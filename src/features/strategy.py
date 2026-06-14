"""Strategy & compound extraction from race laps (Model B spike, PRD §6.2).

- count_stops: per-driver pit-stop count (stints - 1)
- dominant_compound: which dry compound took the most race laps (race-level top-1)
- sc_disruption_fraction: share of laps run under SC/VSC/red — used to flag races
  where stops were safety-car-forced rather than planned strategy
"""
from __future__ import annotations

import numpy as np
import pandas as pd

DRY_COMPOUNDS = {"SOFT", "MEDIUM", "HARD"}
# fastf1 TrackStatus codes: 1 green, 2 yellow, 4 safety car, 5 red, 6/7 VSC.
SC_CODES = ("4", "5", "6", "7")


def count_stops(laps: pd.DataFrame) -> pd.DataFrame:
    """Per-driver pit-stop count = number of stints minus one."""
    stints = laps.groupby("Driver")["Stint"].nunique()
    return (stints - 1).rename("n_stops").reset_index()


def dominant_compound(laps: pd.DataFrame) -> str | None:
    """The dry compound (SOFT/MEDIUM/HARD) that took the most laps across the field."""
    dry = laps[laps["Compound"].isin(DRY_COMPOUNDS)]
    if dry.empty:
        return None
    return dry["Compound"].value_counts().idxmax()


def sc_disruption_fraction(laps: pd.DataFrame) -> float:
    """Fraction of laps run under safety car / VSC / red flag (strategy-distorting)."""
    if laps.empty:
        return 0.0
    status = laps["TrackStatus"].astype(str)
    disrupted = status.apply(lambda s: any(code in s for code in SC_CODES))
    return float(disrupted.mean())


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
