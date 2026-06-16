"""Probabilistic podium classifier with rolling-origin CV (Phase 1 follow-up).

Predicts P(podium) per driver. Probabilities are the product surface (the UI shows
%s), so we report Brier score alongside top-3 accuracy. The base estimator is a
standardized logistic regression (no class balancing — that overconfidence fix is
in `default_classifier_factory`); proper isotonic calibration needs more data than
~22 weekends provide.

Rolling-origin only (train races 1..N, predict N+1) — never random k-fold.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


def default_classifier_factory():
    # No class_weight="balanced": on the small sample it made probabilities
    # overconfident (predicted 0.86 where the real podium rate was 0.49). Removing
    # it nearly halves held-out Brier while top-3 holds (spec §0). Proper isotonic/
    # Platt calibration is deferred until 2026 data is large enough to fit it.
    return make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=1000),
    )


# Qualitative bands are the product surface while calibration is immature. Thresholds
# anchored to observed podium rates; labels describe chance relative to the field,
# never certainty (spec §6).
def band_for(p: float) -> str:
    if p >= 0.50:
        return "strong"
    if p >= 0.20:
        return "in contention"
    return "outside shot"


def rolling_origin_classify(
    df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
    race_col: str,
    finish_col: str,
    min_train_races: int = 8,
    model_factory=default_classifier_factory,
    ordered_races: list | None = None,
) -> list[dict]:
    """Walk forward, predicting P(podium) for each held-out race from its past."""
    races = ordered_races if ordered_races is not None else list(pd.unique(df[race_col]))
    out = []
    for i in range(min_train_races, len(races)):
        train = df[df[race_col].isin(races[:i])]
        test = df[df[race_col] == races[i]]
        if test.empty or train[target_col].nunique() < 2:
            continue
        model = model_factory()
        model.fit(train[feature_cols], train[target_col])
        proba = model.predict_proba(test[feature_cols])[:, 1]
        out.append({
            "race": races[i],
            "drivers": test["Driver"].tolist(),
            "proba": np.asarray(proba, dtype=float),
            "finish_pos": test[finish_col].to_numpy(dtype=float),
            "n_train_races": i,
        })
    return out


def evaluate_podium(results: list[dict]) -> dict:
    """Top-3 accuracy (predicted-podium vs actual podium) + pooled Brier score.

    Predicted podium = 3 drivers with the highest P(podium); actual podium = the 3
    smallest finishing positions. Brier is pooled over all driver-rows against the
    binary outcome (finished top-3).
    """
    top3s, briers = [], []
    for r in results:
        proba = np.asarray(r["proba"], dtype=float)
        finish = np.asarray(r["finish_pos"], dtype=float)
        k = min(3, len(finish))
        pred_top = set(np.argsort(-proba, kind="stable")[:k])
        actual_top = set(np.argsort(finish, kind="stable")[:k])
        top3s.append(len(pred_top & actual_top) / k)
        outcome = (finish <= 3).astype(float)
        briers.append(np.mean((proba - outcome) ** 2))
    return {
        "top3": float(np.mean(top3s)),
        "brier": float(np.mean(briers)) if briers else float("nan"),
        "n_races": len(results),
    }
