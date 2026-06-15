"""M3 trust anchor — production-path podium reproduction (real data, manual run).

Builds the podium table via the production code (build_podium_table) from the
persisted Phase-1 tables, runs the rolling-origin podium classifier in Friday and
Saturday modes, and prints held-out top-3 + Brier + band reliability. Reproduces the
spec §0 numbers, proving the production path is faithful.

Run from repo root:  PYTHONPATH=. .venv/bin/python notebooks/07_podium.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.calendar import DRY_CIRCUITS, SEASONS, calendar_order
from src.data.results import load_results
from src.models.podium_model import (
    default_classifier_factory,
    evaluate_podium,
    rolling_origin_classify,
)
from src.pipeline import build_podium_table
from src.inference.podium import FRIDAY_COLS, SATURDAY_COLS

pace_df = pd.read_parquet("data/spike_features.parquet")
results = load_results(SEASONS)
df = build_podium_table(pace_df, results)

ordered = [r for r in calendar_order(SEASONS, DRY_CIRCUITS) if r in set(df["race_id"])]
min_train = sum(r.startswith(str(SEASONS[0])) for r in ordered)
print(f"rows={len(df)} weekends={len(ordered)} min_train={min_train} "
      f"base_rate={df['podium'].mean():.3f}")


def run(cols):
    res = rolling_origin_classify(
        df, cols, "podium", "race_id", "finish_pos",
        min_train_races=min_train, model_factory=default_classifier_factory,
        ordered_races=ordered,
    )
    return evaluate_podium(res), res


for name, cols in [("FRIDAY", FRIDAY_COLS), ("SATURDAY", SATURDAY_COLS)]:
    m, res = run(cols)
    print(f"{name:9} top3={m['top3']:.3f} brier={m['brier']:.3f} n={m['n_races']}")
    proba = np.concatenate([r["proba"] for r in res])
    outcome = np.concatenate([(r["finish_pos"] <= 3).astype(float) for r in res])
    print(f"  band reliability ({name}):")
    for lo, hi, label in [(0.5, 1.01, "strong"), (0.2, 0.5, "in contention"),
                          (0.0, 0.2, "outside shot")]:
        sel = (proba >= lo) & (proba < hi)
        if sel.sum():
            print(f"    {label:14} pred={proba[sel].mean():.2f} "
                  f"actual={outcome[sel].mean():.2f} n={int(sel.sum())}")
