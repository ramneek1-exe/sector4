"""End-to-end Phase 1 spike (brief Steps 0-9).

Runs the full validation: build the feature table from 2023-2025 FP long runs,
train Model A with rolling-origin CV, compare against the grid-position baseline
(the number to beat) plus a raw-FP-pace baseline and a naive-mean MAE floor,
then print the metrics table and a go/no-go call.

Run from repo root:  python notebooks/02_spike.py

Logic lives in src/ (CLAUDE.md); this file only orchestrates and reports.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root on path

from src.eval.baseline import static_baseline
from src.eval.metrics import evaluate_predictions
from src.features.assemble import MODEL_FEATURE_COLS, build_dataset
from src.models.pace_model import feature_importance, rolling_origin_predict

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

# Representative circuit mix spanning the overtaking spectrum, so the grid
# baseline is NOT artificially strong (the earlier 5-circuit set was all
# low-overtaking, where grid scored 73% top-3 vs the PRD's expected ~50-55%):
#   low overtaking  : Spain, Hungary, Abu Dhabi
#   medium          : Bahrain, Mexico City
#   high overtaking : Saudi Arabia, Italy (Monza), Las Vegas
# All dry, non-sprint (FP2 exists), recurring across 2023-2025. Listed in
# season-calendar order so rolling-origin trains on 2023 and predicts 2024-2025.
CIRCUITS = [
    "Bahrain", "Saudi Arabia", "Spain", "Hungary",
    "Italy", "Mexico City", "Las Vegas", "Abu Dhabi",
]
YEARS = [2023, 2024, 2025]
WEEKENDS = [(year, gp) for year in YEARS for gp in CIRCUITS]

MIN_TRAIN_RACES = len(CIRCUITS)  # warm up on all of 2023, then predict forward
RACE_COL, TARGET_COL, FINISH_COL = "race_id", "race_pace_delta", "finish_pos"


def _fmt(x):
    return "  n/a" if x is None else f"{x:6.3f}"


def per_race_rho(df, col_a, col_b, races):
    """Mean (and pooled) per-weekend Spearman rho between two driver-level cols."""
    rhos = []
    for race in races:
        g = df[df["race_id"] == race]
        if len(g) >= 5:
            rho, _ = spearmanr(g[col_a], g[col_b])
            if not np.isnan(rho):
                rhos.append(rho)
    return float(np.mean(rhos)) if rhos else float("nan")


def main():
    print("\n=== Building feature table (2023-2025) ===")
    df = build_dataset(WEEKENDS)
    if df.empty:
        raise SystemExit("No usable weekends built — check fastf1 availability.")

    # Calendar order for the rolling-origin split. build_dataset already returns
    # weekends in WEEKENDS order; we pass this explicitly so the CV NEVER sorts
    # alphabetically (which would train on later-in-season races -> look-ahead).
    ordered_races = [f"{year}-{gp}" for year, gp in WEEKENDS if f"{year}-{gp}" in set(df["race_id"])]
    df["zero_pred"] = 0.0  # naive-mean predictor (field-mean delta) for the MAE floor
    df.to_parquet("data/spike_features.parquet")

    n_weekends = df["race_id"].nunique()
    print(f"\nBuilt {len(df)} driver-rows across {n_weekends} weekends.")
    print("FP source mix:", df.groupby("fp_source")["race_id"].nunique().to_dict())
    print("Feature columns:", MODEL_FEATURE_COLS)

    # --- HEADLINE DIAGNOSTIC: does engineered FP pace track race pace at all? ---
    # This is the question the whole product rests on, isolated from the model and
    # from finishing-order/DNF noise: per-weekend rank correlation of engineered FP
    # long-run pace vs actual race pace. Grid->race-pace shown for context.
    all_races = list(df["race_id"].unique())
    fp_rho = per_race_rho(df, "fp_pace_delta", "race_pace_delta", all_races)
    grid_rho = per_race_rho(df, "grid_position", "race_pace_delta", all_races)
    print("\n=== HEADLINE: FP-pace -> race-pace correlation (per-weekend mean rho) ===")
    print(f"  Engineered FP long-run pace  vs race pace : {fp_rho:+.3f}")
    print(f"  Grid position               vs race pace : {grid_rho:+.3f}")
    print("  (per-weekend Spearman, averaged across all weekends; higher = more predictive)")

    # --- Model A: rolling-origin CV ---
    model_results = rolling_origin_predict(
        df, MODEL_FEATURE_COLS, TARGET_COL, RACE_COL, FINISH_COL,
        min_train_races=MIN_TRAIN_RACES, ordered_races=ordered_races,
    )
    held_out = [r["race"] for r in model_results]
    print(f"\nHeld-out races ({len(held_out)}): {held_out}")
    model_metrics = evaluate_predictions(model_results)

    # --- Baselines, scored on the same held-out races ---
    common = dict(
        race_col=RACE_COL, target_col=TARGET_COL, finish_col=FINISH_COL,
        min_train_races=MIN_TRAIN_RACES, ordered_races=ordered_races,
    )
    grid_metrics = evaluate_predictions(static_baseline(df, "grid_position", **common))
    fp_metrics = evaluate_predictions(static_baseline(df, "fp_pace_delta", **common))
    naive_metrics = evaluate_predictions(static_baseline(df, "zero_pred", **common))

    # --- Results table ---
    print("\n=== RESULTS (held-out races) ===")
    print(f"{'Predictor':<24}{'MAE':>8}{'Top-3':>8}{'Spearman':>10}")
    print("-" * 50)
    print(f"{'Model A (RF)':<24}{_fmt(model_metrics['mae'])}{_fmt(model_metrics['top3'])}{_fmt(model_metrics['spearman']):>12}")
    print(f"{'Grid position (baseline)':<24}{_fmt(None)}{_fmt(grid_metrics['top3'])}{_fmt(grid_metrics['spearman']):>12}")
    print(f"{'Raw FP pace':<24}{_fmt(fp_metrics['mae'])}{_fmt(fp_metrics['top3'])}{_fmt(fp_metrics['spearman']):>12}")
    print(f"{'Naive mean (MAE floor)':<24}{_fmt(naive_metrics['mae'])}{_fmt(None)}{_fmt(None):>12}")

    # --- Feature importances (Step 8) ---
    imp = feature_importance(df, MODEL_FEATURE_COLS, TARGET_COL)
    print("\n=== Feature importances (Model A on full data) ===")
    for name, val in imp.items():
        print(f"  {name:<16}{val:6.3f}")

    # --- Decision gate (CLAUDE.md / brief) ---
    beats_grid_top3 = model_metrics["top3"] > grid_metrics["top3"]
    beats_grid_rho = model_metrics["spearman"] > grid_metrics["spearman"]
    beats_naive_mae = model_metrics["mae"] < naive_metrics["mae"]
    go = beats_grid_top3 and beats_grid_rho and beats_naive_mae

    print("\n=== DECISION GATE ===")
    print(f"  Model top-3 > grid top-3 ........ {beats_grid_top3} "
          f"({model_metrics['top3']:.3f} vs {grid_metrics['top3']:.3f})")
    print(f"  Model rho   > grid rho .......... {beats_grid_rho} "
          f"({model_metrics['spearman']:.3f} vs {grid_metrics['spearman']:.3f})")
    print(f"  Model MAE   < naive-mean MAE .... {beats_naive_mae} "
          f"({model_metrics['mae']:.3f} vs {naive_metrics['mae']:.3f})")
    print(f"\n  >>> {'GO' if go else 'NO-GO'} <<<")
    return go


if __name__ == "__main__":
    main()
