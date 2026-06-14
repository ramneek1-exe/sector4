"""Phase 1 follow-up: does FP pace add value over FRIDAY signals (no grid/quali)?

The prior spike showed FP pace doesn't beat grid. But grid is a Saturday input;
Sector 4's signature window (PRD §7.3) is Friday -> pre-quali, when grid doesn't
exist yet. This tests the product's actual question: with grid and qualifying
excluded entirely, does engineered FP long-run pace add incremental predictive
value over what's knowable on Friday (standings, recent form, track history)?

3-way ablation on the same 15 held-out races (rolling-origin, train 2023):
  A_friday   = standings + form + track-history (+ track-intrinsic), NO FP, NO grid
  B_fp       = FP features (+ track-intrinsic) only
  C_combined = Friday + FP
Plus non-model baselines: standings-order, trailing-3-race-average.

Reuses the existing FP pipeline / feature table; only adds Friday features.
Run from repo root:  python notebooks/03_friday_ablation.py
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.results import load_results
from src.eval.baseline import static_baseline
from src.eval.metrics import evaluate_predictions
from src.features.friday import add_friday_features, NEUTRAL_POS
from src.features.track import TRACK_FEATURE_COLS
from src.models.pace_model import feature_importance, rolling_origin_predict

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

CIRCUITS = ["Bahrain", "Saudi Arabia", "Spain", "Hungary",
            "Italy", "Mexico City", "Las Vegas", "Abu Dhabi"]
YEARS = [2023, 2024, 2025]
GP_TO_EVENT = {
    "Bahrain": "Bahrain Grand Prix", "Saudi Arabia": "Saudi Arabian Grand Prix",
    "Spain": "Spanish Grand Prix", "Hungary": "Hungarian Grand Prix",
    "Italy": "Italian Grand Prix", "Mexico City": "Mexico City Grand Prix",
    "Las Vegas": "Las Vegas Grand Prix", "Abu Dhabi": "Abu Dhabi Grand Prix",
}

TARGET, RACE_COL, FINISH = "race_pace_delta", "race_id", "finish_pos"
FRIDAY = ["champ_points_before", "champ_rank_before", "form_finish_avg3", "track_hist_finish"]
FP = ["fp_pace_delta", "fp_deg_slope"]
A_COLS = FRIDAY + TRACK_FEATURE_COLS              # Friday only
B_COLS = FP + TRACK_FEATURE_COLS                  # FP only
C_COLS = FRIDAY + FP + TRACK_FEATURE_COLS         # combined


def _fmt(x):
    return "  n/a" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:6.3f}"


def per_race_rho(df, col_a, col_b, races):
    rhos = []
    for race in races:
        g = df[df[RACE_COL] == race]
        if len(g) >= 5:
            rho, _ = spearmanr(g[col_a], g[col_b])
            if not np.isnan(rho):
                rhos.append(rho)
    return float(np.mean(rhos)) if rhos else float("nan")


def main():
    df = pd.read_parquet("data/spike_features.parquet")
    print(f"Loaded {len(df)} rows / {df[RACE_COL].nunique()} weekends from the FP spike.")

    # --- Friday features from prior races (results only; leakage-guarded) ---
    print("Loading race results (full calendar) for standings/form/track history...")
    results = load_results(YEARS)
    df = add_friday_features(df, results, GP_TO_EVENT)
    cov = df["track_hist_finish"].notna().mean()
    print(f"Track-history coverage: {cov:.0%} of rows (rest are first visits/rookies).")

    # Impute the Friday-state missingness (round-1 standings, no prior form, debuts).
    df["champ_points_before"] = df["champ_points_before"].fillna(0.0)
    df["champ_rank_before"] = df["champ_rank_before"].fillna(NEUTRAL_POS)
    df["form_finish_avg3"] = df["form_finish_avg3"].fillna(NEUTRAL_POS)
    df["track_hist_finish"] = df["track_hist_finish"].fillna(NEUTRAL_POS)

    ordered = [f"{y}-{gp}" for y in YEARS for gp in CIRCUITS if f"{y}-{gp}" in set(df[RACE_COL])]
    min_train = sum(r.startswith("2023") for r in ordered)  # warm up on 2023
    print(f"Rolling-origin: train {min_train} (2023), predict {len(ordered) - min_train} held-out.")

    def run(cols):
        res = rolling_origin_predict(df, cols, TARGET, RACE_COL, FINISH,
                                     min_train_races=min_train, ordered_races=ordered)
        return evaluate_predictions(res)

    C, A, B = run(C_COLS), run(A_COLS), run(B_COLS)

    common = dict(race_col=RACE_COL, target_col=TARGET, finish_col=FINISH,
                  min_train_races=min_train, ordered_races=ordered)
    standings_bl = evaluate_predictions(static_baseline(df, "champ_rank_before", **common))
    form_bl = evaluate_predictions(static_baseline(df, "form_finish_avg3", **common))
    df["zero_pred"] = 0.0
    naive = evaluate_predictions(static_baseline(df, "zero_pred", **common))
    best_bl = standings_bl if standings_bl["top3"] >= form_bl["top3"] else form_bl
    best_bl_name = "Standings-order" if best_bl is standings_bl else "Trailing-3 avg"

    # --- (3) Headline per-signal correlation vs race pace (all weekends) ---
    all_races = list(df[RACE_COL].unique())
    print("\n=== Per-weekend Spearman rho vs RACE PACE (each signal alone) ===")
    print(f"  FP long-run pace : {per_race_rho(df, 'fp_pace_delta', TARGET, all_races):+.3f}")
    print(f"  Standings (rank) : {per_race_rho(df, 'champ_rank_before', TARGET, all_races):+.3f}")
    print(f"  Recent form (avg): {per_race_rho(df, 'form_finish_avg3', TARGET, all_races):+.3f}")

    # --- (1) Results table ---
    print("\n=== ABLATION RESULTS (15 held-out races) ===")
    print(f"{'Model / baseline':<28}{'MAE':>8}{'Top-3':>8}{'Spearman':>10}")
    print("-" * 54)
    for name, m in [("C_combined (Friday+FP)", C), ("A_friday (no FP)", A),
                    ("B_fp (FP only)", B), (f"{best_bl_name} (baseline)", best_bl)]:
        print(f"{name:<28}{_fmt(m['mae'])}{_fmt(m['top3'])}{_fmt(m['spearman']):>12}")
    print(f"{'Naive mean (MAE floor)':<28}{_fmt(naive['mae'])}{_fmt(None)}{_fmt(None):>12}")
    print(f"\n  (both non-model baselines: standings top3={standings_bl['top3']:.3f} "
          f"rho={standings_bl['spearman']:.3f} | form top3={form_bl['top3']:.3f} "
          f"rho={form_bl['spearman']:.3f})")

    # --- (4) Feature importances for C_combined ---
    imp = feature_importance(df, C_COLS, TARGET)
    print("\n=== C_combined feature importances ===")
    for name, val in imp.items():
        print(f"  {name:<20}{val:6.3f}")

    # --- (2) HEADLINE + (5) secondary + decision gate ---
    d_top3, d_rho = C["top3"] - A["top3"], C["spearman"] - A["spearman"]
    print("\n=== HEADLINE: does FP add incremental value over Friday signals? ===")
    print(f"  C_combined vs A_friday  top-3: {C['top3']:.3f} vs {A['top3']:.3f}  (Δ {d_top3:+.3f})")
    print(f"  C_combined vs A_friday  rho  : {C['spearman']:.3f} vs {A['spearman']:.3f}  (Δ {d_rho:+.3f})")
    print(f"  Secondary — C_combined MAE {C['mae']:.3f} vs naive floor {naive['mae']:.3f} "
          f"(predicted pace/gaps no order baseline can produce)")

    THRESH = 0.02  # "meaningful" margin; not tuned to pass
    go = (d_top3 > THRESH) and (d_rho > THRESH)
    print("\n=== DECISION GATE ===")
    if go:
        print(f"  >>> CONDITIONAL GO <<< FP adds pre-quali value over Friday signals "
              f"(Δtop3 {d_top3:+.3f}, Δrho {d_rho:+.3f}).")
        print("  Recommend reframing the thesis to pre-quali pace prediction.")
    else:
        print(f"  >>> NO-GO <<< FP adds ~nothing over standings/form "
              f"(Δtop3 {d_top3:+.3f}, Δrho {d_rho:+.3f}).")
        print("  Recommend demoting prediction to a supporting feature behind Model B "
              "+ the learning layer.")
    return go


if __name__ == "__main__":
    main()
