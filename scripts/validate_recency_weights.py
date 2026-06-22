"""M5 gate: does recency-weighting preserve the +0.07 stop-count edge on 2023-25?

Reproduces nb 06's PART 1 strategy anchor faithfully (regressor via
rolling_origin_predict + round, train on all 2023, walk-forward 2024-25) and prints
the track+FP-deg accuracy vs the track-norm baseline. Then re-runs the SAME loop with
recency sample-weights at several half-lives. Pick the gentlest decay (largest
half-life) that holds the edge as the production default — never tune the bar.

Reads the persisted strategy table (no fastf1). Run:
  PYTHONPATH=. .venv/bin/python scripts/validate_recency_weights.py
"""
from __future__ import annotations

import numpy as np

from src import store
from src.calendar import DRY_CIRCUITS, calendar_order
from src.eval.baseline import static_baseline
from src.inference.strategy import STRATEGY_FEATURES
from src.inference.weights import recency_weights
from src.models.pace_model import default_model_factory, rolling_origin_predict

TARGET = "n_stops"


def acc_mae(results):
    t = np.concatenate([r["pace_true"] for r in results])
    p = np.concatenate([r["pace_pred"] for r in results])
    return float(np.mean(np.round(p) == t)), float(np.mean(np.abs(p - t)))


def weighted_rolling(df, ordered, min_train, half_life):
    """nb 06's rolling_origin loop, with recency sample-weights on each fit."""
    out = []
    for i in range(min_train, len(ordered)):
        train = df[df["race_id"].isin(ordered[:i])]
        test = df[df["race_id"] == ordered[i]]
        if test.empty:
            continue
        model = default_model_factory()
        yr = int(test["year"].iloc[0])
        w = recency_weights(train, yr, half_life)
        model.fit(train[STRATEGY_FEATURES], train[TARGET], sample_weight=w)
        out.append({"pace_true": test[TARGET].to_numpy(dtype=float),
                    "pace_pred": model.predict(test[STRATEGY_FEATURES]).astype(float)})
    return out


def main():
    df = store.read_table(store.STRATEGY_TABLE)
    ordered = [r for r in calendar_order([2023, 2024, 2025], DRY_CIRCUITS)
               if r in set(df["race_id"])]
    min_train = sum(r.startswith("2023") for r in ordered)
    common = dict(race_col="race_id", target_col=TARGET, finish_col=TARGET,
                  min_train_races=min_train, ordered_races=ordered)

    base = static_baseline(df, "hist_modal_stops", **common)
    base_acc, _ = acc_mae(base)
    anchor = rolling_origin_predict(df, STRATEGY_FEATURES, TARGET, "race_id", TARGET,
                                    min_train_races=min_train, ordered_races=ordered)
    anchor_acc, _ = acc_mae(anchor)
    print(f"track-norm baseline (modal):   {base_acc:.3f}")
    print(f"track+FP deg (UNWEIGHTED nb06): {anchor_acc:.3f}  edge {anchor_acc - base_acc:+.3f}")

    for hl in (4.0, 3.0, 2.0, 1.0):
        acc, _ = acc_mae(weighted_rolling(df, ordered, min_train, hl))
        edge = acc - base_acc
        ok = edge >= (anchor_acc - base_acc) - 0.005  # must not regress vs the anchor edge
        print(f"track+FP deg (half_life={hl}): {acc:.3f}  edge {edge:+.3f}  "
              f"{'OK' if ok else 'REGRESSED'}")


if __name__ == "__main__":
    main()
