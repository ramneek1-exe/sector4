"""Tests for the rolling-origin podium classifier + its evaluation."""
import numpy as np
import pandas as pd
import pytest

from src.models.podium_model import rolling_origin_classify, evaluate_podium


def make_dataset(n_races=6, n_drivers=10, seed=0):
    rng = np.random.default_rng(seed)
    recs = []
    for r in range(n_races):
        skill = rng.normal(0, 1, n_drivers)
        order = np.argsort(skill)              # fastest first
        finish = np.empty(n_drivers, dtype=int)
        finish[order] = np.arange(1, n_drivers + 1)
        for d in range(n_drivers):
            recs.append({
                "race": f"R{r}", "Driver": f"D{d}", "feat": skill[d],
                "finish_pos": int(finish[d]), "was_podium": int(finish[d] <= 3),
            })
    return pd.DataFrame(recs)


def _factory():
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    return make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))


def test_classify_predicts_only_after_warmup_and_grows_train():
    df = make_dataset(6)
    res = rolling_origin_classify(
        df, ["feat"], "was_podium", "race", "finish_pos",
        min_train_races=3, model_factory=_factory,
    )
    assert [r["race"] for r in res] == ["R3", "R4", "R5"]
    assert [r["n_train_races"] for r in res] == [3, 4, 5]


def test_classify_arrays_aligned_and_proba_in_unit_interval():
    df = make_dataset(5)
    res = rolling_origin_classify(
        df, ["feat"], "was_podium", "race", "finish_pos",
        min_train_races=3, model_factory=_factory,
    )
    for r in res:
        assert len(r["proba"]) == len(r["drivers"]) == len(r["finish_pos"])
        assert np.all((r["proba"] >= 0) & (r["proba"] <= 1))


def test_evaluate_podium_perfect_probabilities():
    # proba ranks the actual podium first in both races -> top3 == 1.0
    res = [
        {"drivers": list("ABCDE"), "proba": np.array([0.9, 0.8, 0.7, 0.2, 0.1]),
         "finish_pos": np.array([1, 2, 3, 4, 5])},
        {"drivers": list("ABCDE"), "proba": np.array([0.1, 0.2, 0.95, 0.9, 0.85]),
         "finish_pos": np.array([5, 4, 1, 2, 3])},
    ]
    out = evaluate_podium(res)
    assert out["top3"] == pytest.approx(1.0)
    assert out["n_races"] == 2
    assert 0.0 <= out["brier"] <= 1.0


def test_evaluate_podium_partial_overlap():
    res = [
        {"drivers": list("ABCDE"), "proba": np.array([0.9, 0.8, 0.1, 0.7, 0.2]),
         "finish_pos": np.array([1, 2, 3, 4, 5])},  # pred podium A,B,D ; actual A,B,C -> 2/3
    ]
    assert evaluate_podium(res)["top3"] == pytest.approx(2 / 3)
