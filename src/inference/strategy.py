"""predict_stop_counts — Model B: per-driver stop count + safety-car caveat.

The validated telemetry edge (+0.07 vs track-norm) and the deg->stops explainer
hook. Reads ONLY the persisted strategy feature table (no fastf1) and trains on
strictly prior weekends via store.prior_weekends. The SC caveat is ALWAYS
attached: the edge is measured on a dry / safety-car-clean backtest, so live
accuracy is lower. Numbers rounded at the boundary. (design §7)
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from src import store
from src.calendar import race_id
from src.inference.weights import recency_weights

BASE_TRACK = ["pit_loss_s", "abrasiveness", "track_temp", "hist_modal_stops"]
FP_DEG = ["deg_overall", "deg_SOFT", "deg_MEDIUM", "deg_HARD", "feas_max_stint"]
STRATEGY_FEATURES = BASE_TRACK + FP_DEG
MIN_TRAIN_RACES = 3  # below this, no honest stop-count band (design §7)
SC_CAVEAT = (
    "Stop-count edge is measured on a dry, safety-car-clean backtest; a safety "
    "car can erase or add a stop, so live accuracy is lower."
)


def _classifier():
    """Random Forest, matching the validated Model B spike (nb 06)."""
    return RandomForestClassifier(n_estimators=200, random_state=0)


def predict_stop_counts(year: int, gp: str, table: pd.DataFrame | None = None,
                        half_life_years: float = 2.0) -> dict:
    """Per-driver predicted pit-stop count + confidence, with SC uncertainty caveat."""
    table = table if table is not None else store.read_table(store.STRATEGY_TABLE)
    target = table[table["race_id"] == race_id(year, gp)]
    if target.empty:
        return {"year": year, "gp": gp, "qualitative": True,
                "reason": "no feature row for target weekend",
                "sc_caveat": SC_CAVEAT, "dominant": None, "drivers": []}

    prior = store.prior_weekends(table, year, gp)
    n_train = int(prior["race_id"].nunique())
    if n_train < MIN_TRAIN_RACES or prior["n_stops"].nunique() < 2:
        return {"year": year, "gp": gp, "qualitative": True, "n_train_races": n_train,
                "reason": "too few prior weekends / classes for a stop-count model",
                "sc_caveat": SC_CAVEAT, "dominant": None, "drivers": []}

    clf = _classifier()
    w = recency_weights(prior, year, half_life_years)
    clf.fit(prior[STRATEGY_FEATURES], prior["n_stops"], sample_weight=w)
    proba = clf.predict_proba(target[STRATEGY_FEATURES])
    classes = clf.classes_
    preds = classes[np.argmax(proba, axis=1)]
    conf = proba.max(axis=1)

    drivers = [
        {"driver": d, "n_stops": int(p), "confidence": round(float(c), 3)}
        for d, p, c in zip(target["Driver"], preds, conf)
    ]
    pred_counts = Counter(int(p) for p in preds)
    mode_stops, mode_n = pred_counts.most_common(1)[0]
    dominant = {"n_stops": int(mode_stops),
                "share": round(mode_n / len(preds), 3),
                "n_drivers": int(len(preds))}
    return {"year": year, "gp": gp, "qualitative": False, "n_train_races": n_train,
            "sc_caveat": SC_CAVEAT, "dominant": dominant, "drivers": drivers}


def dominant_compound_norm(year: int, gp: str, table: pd.DataFrame | None = None) -> dict:
    """Historical 'typical compound here' from the leakage-safe hist_dominant column.

    Dominant compound has NO telemetry edge (Phase 1: 0.733 = 0.733), so this is a historical
    NORM, not a prediction. Reads ONLY the persisted strategy table's `hist_dominant` (the mode
    of the circuit's dominant dry compound over strictly-earlier years), never the target
    year's own compound. For an upcoming race (no row for `year`) it falls back to the latest
    prior running's hist_dominant, which lags the most recent running by one year.
    """
    table = table if table is not None else store.read_table(store.STRATEGY_TABLE)
    rows = (
        table[table["gp"] == gp][["year", "hist_dominant"]]
        .drop_duplicates()
        .dropna(subset=["hist_dominant"])
    )
    none_result = {"year": year, "gp": gp, "compound": None, "basis_year": None}
    if rows.empty:
        return none_result
    exact = rows[rows["year"] == year]
    if not exact.empty:
        chosen = exact.iloc[0]
    else:
        prior = rows[rows["year"] < year]
        if prior.empty:
            return none_result
        chosen = prior.sort_values("year").iloc[-1]
    return {
        "year": year,
        "gp": gp,
        "compound": str(chosen["hist_dominant"]),
        "basis_year": int(chosen["year"]),
    }
