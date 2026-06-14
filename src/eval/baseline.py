"""Static (non-trained) baselines for Model A to beat (spike Step 6).

A static baseline predicts directly from an existing column, so it needs no
training. To stay apples-to-apples with the rolling-origin model, it is scored
on the SAME held-out races (those at or after `min_train_races`).

Used for:
  - grid baseline      -> pred_col="grid_position"  (the number to beat: top3/rho)
  - raw FP-pace        -> pred_col="fp_pace_delta"  (does the model add value?)
  - naive mean (MAE)   -> a zero column (predict the field-mean delta)
"""
from __future__ import annotations

import pandas as pd


def static_baseline(
    df: pd.DataFrame,
    pred_col: str,
    race_col: str,
    target_col: str,
    finish_col: str,
    min_train_races: int = 3,
    ordered_races: list | None = None,
) -> list[dict]:
    """Build per-race prediction dicts (held-out races only) from `pred_col`.

    Output matches `evaluate_predictions`' contract: pace_true / pace_pred /
    finish_pos per race.
    """
    races = ordered_races if ordered_races is not None else list(pd.unique(df[race_col]))
    out = []
    for race in races[min_train_races:]:
        race_df = df[df[race_col] == race]
        if race_df.empty:
            continue
        out.append(
            {
                "race": race,
                "drivers": race_df["Driver"].tolist(),
                "pace_true": race_df[target_col].to_numpy(dtype=float),
                "pace_pred": race_df[pred_col].to_numpy(dtype=float),
                "finish_pos": race_df[finish_col].to_numpy(dtype=float),
            }
        )
    return out
