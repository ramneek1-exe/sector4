"""Tests for the static (non-trained) baselines (spike Step 6)."""
import numpy as np
import pandas as pd
import pytest

from src.eval.baseline import static_baseline


def _df():
    recs = []
    for r in range(5):
        for d in range(4):
            recs.append(
                {
                    "race": f"R{r}",
                    "Driver": f"D{d}",
                    "grid_position": d + 1,
                    "target": float(d) * 0.1,
                    "finish_pos": d + 1,
                }
            )
    return pd.DataFrame(recs)


def test_static_baseline_only_emits_held_out_races():
    out = static_baseline(
        _df(), pred_col="grid_position", race_col="race",
        target_col="target", finish_col="finish_pos", min_train_races=3,
    )
    assert [r["race"] for r in out] == ["R3", "R4"]


def test_static_baseline_uses_chosen_column_as_prediction():
    out = static_baseline(
        _df(), pred_col="grid_position", race_col="race",
        target_col="target", finish_col="finish_pos", min_train_races=3,
    )
    # grid baseline predicts pace order == grid order
    assert out[0]["pace_pred"].tolist() == [1, 2, 3, 4]
    assert out[0]["pace_true"].tolist() == pytest.approx([0.0, 0.1, 0.2, 0.3])
    assert out[0]["finish_pos"].tolist() == [1, 2, 3, 4]
