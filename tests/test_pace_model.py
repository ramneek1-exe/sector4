"""Tests for the rolling-origin CV harness (spike Step 7)."""
import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import RandomForestRegressor

from src.models.pace_model import rolling_origin_predict, feature_importance


def make_dataset(n_races=6, n_drivers=4, seed=0):
    """Synthetic: race pace is a clean function of one feature, so a competent
    harness should rank held-out races almost perfectly."""
    rng = np.random.default_rng(seed)
    recs = []
    for r in range(n_races):
        skills = rng.normal(0, 1, n_drivers)  # per-driver pace in this race
        order = np.argsort(skills)            # fastest -> P1
        finish = np.empty(n_drivers, dtype=int)
        finish[order] = np.arange(1, n_drivers + 1)
        for d in range(n_drivers):
            recs.append(
                {
                    "race": f"R{r}",
                    "Driver": f"D{d}",
                    "feat": skills[d],          # informative feature
                    "target": skills[d],        # race pace delta == feature here
                    "finish_pos": int(finish[d]),
                }
            )
    return pd.DataFrame(recs)


def _factory():
    return RandomForestRegressor(n_estimators=50, random_state=0)


def test_rolling_origin_predicts_only_after_warmup():
    df = make_dataset(n_races=6)
    results = rolling_origin_predict(
        df, ["feat"], "target", "race", "finish_pos",
        min_train_races=3, model_factory=_factory,
    )
    # races R3, R4, R5 are held out -> 3 predicted races
    assert [r["race"] for r in results] == ["R3", "R4", "R5"]


def test_rolling_origin_never_trains_on_held_out_or_future_races():
    df = make_dataset(n_races=6)
    results = rolling_origin_predict(
        df, ["feat"], "target", "race", "finish_pos",
        min_train_races=3, model_factory=_factory,
    )
    # training set grows by exactly one race each step and never includes race i
    assert [r["n_train_races"] for r in results] == [3, 4, 5]


def test_rolling_origin_each_result_has_aligned_arrays():
    df = make_dataset(n_races=5, n_drivers=4)
    results = rolling_origin_predict(
        df, ["feat"], "target", "race", "finish_pos",
        min_train_races=3, model_factory=_factory,
    )
    for r in results:
        assert len(r["pace_true"]) == 4
        assert len(r["pace_pred"]) == 4
        assert len(r["finish_pos"]) == 4
        assert len(r["drivers"]) == 4


def test_feature_importance_picks_the_informative_feature():
    df = make_dataset(n_races=8, n_drivers=6)
    df["noise"] = np.random.default_rng(1).normal(size=len(df))
    imp = feature_importance(df, ["feat", "noise"], "target", _factory)
    assert imp["feat"] > imp["noise"]
