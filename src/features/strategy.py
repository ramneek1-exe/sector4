"""Strategy & compound extraction from race laps (Model B spike, PRD §6.2).

- count_stops: per-driver pit-stop count (stints - 1)
- dominant_compound: which dry compound took the most race laps (race-level top-1)
- sc_disruption_fraction: share of laps run under SC/VSC/red — used to flag races
  where stops were safety-car-forced rather than planned strategy
"""
from __future__ import annotations

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
