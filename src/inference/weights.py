"""Recency sample-weights for cross-era training (M5).

Down-weights older / other-regulation seasons so the 2026 reg-reset season counts
more as it accumulates, without discarding the 2023-25 history outright. Pure numpy
+ pandas; no fastf1. Half-life is tunable and validated against the +0.07 stop-count
anchor (the chosen value must NOT regress it — see the M5 plan, Task 7).
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def recency_weights(prior: pd.DataFrame, target_year: int,
                    half_life_years: float = 2.0) -> np.ndarray:
    """Per-row training weights, exponentially decaying with season age.

    weight = 0.5 ** ((target_year - row.year) / half_life_years). Aligned to
    `prior`'s row order. `prior` must have a 'year' column. Future rows (which should
    not exist under the leakage guard) are clipped to age 0 so they never up-weight.
    """
    age = target_year - prior["year"].to_numpy(dtype=float)
    age = np.clip(age, 0.0, None)
    return np.power(0.5, age / half_life_years)
