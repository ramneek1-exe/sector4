"""Model A: race-pace regression with rolling-origin CV (spike Step 7).

Rolling-origin (time-series) CV: train on races 1..N, validate on race N+1, step
forward. NEVER random k-fold on this small, time-ordered sample — it leaks the
future into the past (CLAUDE.md house rule, PRD §5).
"""
from __future__ import annotations

import pandas as pd
from sklearn.ensemble import RandomForestRegressor


def default_model_factory():
    """Random Forest is the locked starting point (PRD §7.2)."""
    return RandomForestRegressor(n_estimators=300, random_state=42, n_jobs=-1)


def rolling_origin_predict(
    df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
    race_col: str,
    finish_col: str,
    min_train_races: int = 3,
    model_factory=default_model_factory,
    ordered_races: list | None = None,
) -> list[dict]:
    """Walk forward through races, predicting each held-out race from its past.

    `df` must be sorted chronologically (or pass `ordered_races`). For each race
    i >= min_train_races, fit a fresh model on all rows from races 0..i-1 and
    predict race i. Returns one result dict per predicted race with aligned
    arrays (drivers, pace_true, pace_pred, finish_pos) plus n_train_races, which
    proves the held-out race was excluded from training.
    """
    races = ordered_races if ordered_races is not None else list(pd.unique(df[race_col]))
    results = []
    for i in range(min_train_races, len(races)):
        train_races = races[:i]
        test_race = races[i]
        train = df[df[race_col].isin(train_races)]
        test = df[df[race_col] == test_race]
        if test.empty:
            continue
        model = model_factory()
        model.fit(train[feature_cols], train[target_col])
        preds = model.predict(test[feature_cols])
        results.append(
            {
                "race": test_race,
                "drivers": test["Driver"].tolist(),
                "pace_true": test[target_col].to_numpy(dtype=float),
                "pace_pred": preds.astype(float),
                "finish_pos": test[finish_col].to_numpy(dtype=float),
                "n_train_races": len(train_races),
            }
        )
    return results


def feature_importance(
    df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
    model_factory=default_model_factory,
) -> pd.Series:
    """Fit one model on all rows and return feature_importances_ (Step 8).

    Used only to inspect what drives predictions — sanity-check that FP pace and
    track features dominate and nothing leaky sneaks in. Not used for scoring.
    """
    model = model_factory()
    model.fit(df[feature_cols], df[target_col])
    return pd.Series(model.feature_importances_, index=feature_cols).sort_values(
        ascending=False
    )
