"""Stint detection and lap cleaning (spike Step 1, PRD §7.2).

A "long run" is a stint of >=5 laps on one compound with no pit in between.
fastf1 already segments stints via the `Stint` column (it increments on each
pit stop), so a stint is the (Driver, Stint) group. We require the raw stint to
clear the >=5-lap threshold, then clean the laps inside it.

Cleaning rules:
  - drop laps with no recorded time (LapTime is NaT)
  - drop deleted/invalidated laps
  - drop laps run under non-green track status (yellow / SC / red)
  - drop out-laps (PitOutTime set) and in-laps (PitInTime set)
  - drop laps slower than 107% of the stint's clean median (traffic/mistakes)
"""
from __future__ import annotations

import pandas as pd

GREEN = "1"  # fastf1 TrackStatus code for an all-green track


def filter_green_laps(laps: pd.DataFrame) -> pd.DataFrame:
    """Drop unrepresentative laps: NaT times, deleted, non-green, in/out laps."""
    mask = (
        laps["LapTime"].notna()
        & (laps["Deleted"] != True)  # noqa: E712 - NaN/None treated as not-deleted
        & (laps["TrackStatus"].astype(str) == GREEN)
        & laps["PitInTime"].isna()
        & laps["PitOutTime"].isna()
    )
    return laps.loc[mask].copy()


def long_run_stints(
    laps: pd.DataFrame,
    min_laps: int = 5,
    pct: float = 1.07,
    min_clean: int = 4,
) -> pd.DataFrame:
    """Return cleaned laps belonging to qualifying long-run stints.

    Adds columns:
      - StintId: "<Driver>-<Stint>"
      - LapTimeSeconds: LapTime as float seconds
      - LapInStint: 1-based lap position within the cleaned stint (by LapNumber)

    A stint qualifies if its RAW length >= min_laps and, after cleaning and the
    107% filter, it still has >= min_clean laps to fit a pace model on.
    """
    kept = []
    for (driver, stint), grp in laps.groupby(["Driver", "Stint"], sort=False):
        if len(grp) < min_laps:  # raw long-run threshold
            continue
        clean = filter_green_laps(grp)
        if clean.empty:
            continue
        clean = clean.copy()
        clean["LapTimeSeconds"] = clean["LapTime"].dt.total_seconds()
        median = clean["LapTimeSeconds"].median()
        clean = clean[clean["LapTimeSeconds"] <= pct * median]
        if len(clean) < min_clean:
            continue
        clean = clean.sort_values("LapNumber")
        clean["StintId"] = f"{driver}-{stint}"
        clean["LapInStint"] = range(1, len(clean) + 1)
        kept.append(clean)

    if not kept:
        return laps.iloc[0:0].assign(
            StintId=pd.Series(dtype="object"),
            LapTimeSeconds=pd.Series(dtype="float"),
            LapInStint=pd.Series(dtype="int"),
        )
    return pd.concat(kept, ignore_index=True)
