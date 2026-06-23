"""Data-derived pit-lane time loss (PRD §7.2 — the real answer, not the curated prior).

Measures, from a race's own lap data, the FULL time a driver loses by pitting: for each
stop, loss = (in-lap − the green lap just before) + (out-lap − the green lap just after),
i.e. how much the two pit-affected laps cost versus the closest comparable racing laps.
That total INCLUDES the ~2.5s the car is stationary for the tyre change — the same
convention the F1 broadcast/website quote (e.g. the Red Bull Ring ≈ 20s). A robust median
over every clean stop in the race shrinks the influence of safety cars and backmarkers.

Pure pandas; no fastf1 import (the caller passes a loaded session's `laps`).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Typical time the car is stationary for a tyre change — already included in the loss
# above; surfaced as an insight so the number is explained, not just stated.
STATIONARY_S_EST = 2.5

# Plausible full-stop window (s); discard out-of-band pairs (SC in/out laps, errors).
_MIN_LOSS, _MAX_LOSS = 8.0, 40.0


def derive_race_pit_loss(laps: pd.DataFrame) -> tuple[float | None, int]:
    """Median full pit-lane time loss (s) for one race, and the stop count it averaged.

    Returns (None, 0) when no clean in/out-lap pairs are available (e.g. a race with no
    green-flag stops in the cache). Rounded at the boundary (house rule).
    """
    losses: list[float] = []
    for _, ld in laps.groupby("Driver"):
        ld = ld.sort_values("LapNumber").reset_index(drop=True)
        sec = ld["LapTime"].dt.total_seconds()
        for i in range(1, len(ld) - 2):
            # in-lap at i (PitInTime set), out-lap at i+1 (PitOutTime set)
            if not (pd.notna(ld.loc[i, "PitInTime"]) and pd.notna(ld.loc[i + 1, "PitOutTime"])):
                continue
            prev_, in_, out_, next_ = sec.get(i - 1), sec.get(i), sec.get(i + 1), sec.get(i + 2)
            if any(pd.isna(x) for x in (prev_, in_, out_, next_)):
                continue
            # skip when a comparison lap is itself pit-affected (back-to-back stop window)
            if pd.notna(ld.loc[i - 1, "PitInTime"]) or pd.notna(ld.loc[i + 2, "PitOutTime"]):
                continue
            loss = (in_ - prev_) + (out_ - next_)
            if _MIN_LOSS < loss < _MAX_LOSS:
                losses.append(loss)
    if not losses:
        return None, 0
    return round(float(np.median(losses)), 1), len(losses)
