"""predict_pace_gaps — Model A (demoted): per-driver pace delta + uncertainty.

Reads ONLY the persisted pace feature table (no fastf1) and trains on strictly
prior weekends via store.prior_weekends. Feature-column names are declared here
(NOT imported from src.features.assemble, which imports fastf1) so this module
stays fastf1-free. Uncertainty = std across RandomForest trees — an honest band.
Numbers are rounded at the boundary. (design §5, §7)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from src import store
from src.calendar import race_id
from src.features.track import TRACK_FEATURE_COLS
from src.models.pace_model import default_model_factory

# Pre-race, Friday-usable features only — no grid (quali-derived). Mirrors the
# FP feature names produced by src.features.assemble.build_weekend.
FP_FEATURE_COLS = ["fp_pace_delta", "fp_deg_slope"]
PACE_INFER_COLS = FP_FEATURE_COLS + TRACK_FEATURE_COLS
MIN_TRAIN_RACES = 3  # below this, no honest numeric band (design §7)


def predict_pace_gaps(year: int, gp: str, table: pd.DataFrame | None = None,
                      model_factory=default_model_factory) -> dict:
    """Per-driver predicted race-pace delta (lower = faster) + uncertainty band."""
    table = table if table is not None else store.read_table(store.PACE_TABLE)
    target = table[table["race_id"] == race_id(year, gp)]
    if target.empty:
        return {"year": year, "gp": gp, "qualitative": True,
                "reason": "no feature row for target weekend", "drivers": []}

    prior = store.prior_weekends(table, year, gp)
    n_train = int(prior["race_id"].nunique())
    if n_train < MIN_TRAIN_RACES:
        return {"year": year, "gp": gp, "qualitative": True, "n_train_races": n_train,
                "reason": "too few prior weekends for a calibrated gap", "drivers": []}

    model = model_factory()
    model.fit(prior[PACE_INFER_COLS], prior["race_pace_delta"])
    X = target[PACE_INFER_COLS]
    per_tree = np.stack([est.predict(X) for est in model.estimators_])
    mean = per_tree.mean(axis=0)
    std = per_tree.std(axis=0)

    drivers = [
        {"driver": d, "pace_delta_s": round(float(m), 3), "uncertainty_s": round(float(s), 3)}
        for d, m, s in zip(target["Driver"], mean, std)
    ]
    drivers.sort(key=lambda r: r["pace_delta_s"])
    return {"year": year, "gp": gp, "qualitative": False,
            "n_train_races": n_train, "drivers": drivers}
