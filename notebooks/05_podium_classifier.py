"""SECONDARY: probabilistic podium classifier — Friday vs Saturday modes.

PRIMARY showed quali-sim pace doesn't beat standings at predicting the grid, so a
practice-data edge is unlikely. This characterizes the fallback the gate points to:
a podium product built on standings + form + grid as honest, calibrated
probabilities. Questions answered here:
  - Does a FRIDAY-mode classifier (quali-sim-predicted grid, no actual grid) beat
    the ~0.667 standings baseline on top-3?
  - Does quali-sim-predicted grid add anything over standings/form (the edge test)?
  - How much does SATURDAY mode (actual grid) tighten it (toward the ~0.778 grid)?
  - Are the probabilities calibrated (Brier + reliability)?

Incremental feature ablation: each candidate must improve held-out top-3 or be cut.
Reuses spike_features + qualisim_table; leakage-guarded Friday features.

Run from repo root:  python notebooks/05_podium_classifier.py
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.results import load_results
from src.eval.baseline import static_baseline
from src.eval.metrics import evaluate_predictions
from src.features.friday import add_friday_features, constructor_standings_before
from src.models.podium_model import evaluate_podium, rolling_origin_classify

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")

CIRCUITS = ["Bahrain", "Saudi Arabia", "Spain", "Hungary",
            "Italy", "Mexico City", "Las Vegas", "Abu Dhabi"]
YEARS = [2023, 2024, 2025]
GP_TO_EVENT = {
    "Bahrain": "Bahrain Grand Prix", "Saudi Arabia": "Saudi Arabian Grand Prix",
    "Spain": "Spanish Grand Prix", "Hungary": "Hungarian Grand Prix",
    "Italy": "Italian Grand Prix", "Mexico City": "Mexico City Grand Prix",
    "Las Vegas": "Las Vegas Grand Prix", "Abu Dhabi": "Abu Dhabi Grand Prix",
}
TARGET, RACE_COL, FINISH = "was_podium", "race_id", "finish_pos"


def build_table():
    sf = pd.read_parquet("data/spike_features.parquet")
    qt = pd.read_parquet("data/qualisim_table.parquet")
    df = sf[["race_id", "year", "gp", "Driver", "finish_pos", "grid_position",
             "race_pace_delta"]].merge(
        qt[["race_id", "Driver", "qsim_delta"]], on=["race_id", "Driver"], how="inner")
    df["was_podium"] = (df["finish_pos"] <= 3).astype(int)
    # Friday predicted grid = rank of quali-sim pace within the weekend (1 = fastest).
    df["qsim_grid"] = df.groupby("race_id")["qsim_delta"].rank(method="first")

    results = load_results(YEARS)
    df = add_friday_features(df, results, GP_TO_EVENT)

    # Prior-year RACE pace at this circuit (strictly prior years; leakage-safe).
    sf_idx = sf.set_index(["gp", "Driver", "year"])["race_pace_delta"].sort_index()
    def _prior_track_pace(row):
        prior = [sf.loc[(sf.gp == row.gp) & (sf.Driver == row.Driver) & (sf.year < row.year),
                        "race_pace_delta"]]
        vals = prior[0]
        return vals.mean() if len(vals) else np.nan
    df["prior_track_pace"] = df.apply(_prior_track_pace, axis=1)

    # Constructor standings: driver's team this weekend -> team points before race.
    team_map = results.rename(columns={"gp": "event"})[["year", "event", "Driver", "team"]]
    df["event"] = df["gp"].map(GP_TO_EVENT)
    df = df.merge(team_map, on=["year", "event", "Driver"], how="left")
    cons = []
    for (year, gp), g in df.groupby(["year", "gp"]):
        event = GP_TO_EVENT[gp]
        m = (results["year"] == year) & (results["gp"] == event)
        bd = results.loc[m, "date"].iloc[0] if m.any() else None
        cmap = constructor_standings_before(results, year, bd) if bd is not None else {}
        cons.append(g["team"].map(cmap).rename("constructor_points_before"))
    df["constructor_points_before"] = pd.concat(cons).sort_index()

    # Impute the Friday-state missingness.
    df["champ_points_before"] = df["champ_points_before"].fillna(0.0)
    df["champ_rank_before"] = df["champ_rank_before"].fillna(10.5)
    df["form_finish_avg3"] = df["form_finish_avg3"].fillna(10.5)
    df["prior_track_pace"] = df["prior_track_pace"].fillna(0.0)
    df["constructor_points_before"] = df["constructor_points_before"].fillna(0.0)
    return df


def main():
    df = build_table()
    ordered = [f"{y}-{gp}" for y in YEARS for gp in CIRCUITS if f"{y}-{gp}" in set(df[RACE_COL])]
    min_train = sum(r.startswith("2023") for r in ordered)
    n_held = len(ordered) - min_train
    print(f"Built classifier table: {len(df)} rows / {len(ordered)} weekends "
          f"({n_held} held-out). Podium base-rate: {df[TARGET].mean():.2f}")

    def run(cols):
        res = rolling_origin_classify(df, cols, TARGET, RACE_COL, FINISH,
                                      min_train_races=min_train, ordered_races=ordered)
        return evaluate_podium(res), res

    # --- Incremental ablation (each candidate must improve held-out top-3) ---
    BASE = ["champ_rank_before", "champ_points_before", "form_finish_avg3"]
    steps = [
        ("standings+form (base)", BASE),
        ("+ prior track pace", BASE + ["prior_track_pace"]),
        ("+ quali-sim grid [FRIDAY]", BASE + ["prior_track_pace", "qsim_grid"]),
        ("+ constructor standings", BASE + ["prior_track_pace", "qsim_grid", "constructor_points_before"]),
    ]
    print("\n=== INCREMENTAL ABLATION (held-out top-3, Brier) ===")
    prev = None
    for name, cols in steps:
        m, _ = run(cols)
        mark = "" if prev is None else ("  (+)" if m["top3"] > prev + 1e-9 else "  (cut: no gain)")
        print(f"  {name:<32} top3={m['top3']:.3f}  brier={m['brier']:.3f}{mark}")
        prev = m["top3"] if prev is None else max(prev, m["top3"])

    # --- Friday vs Saturday modes ---
    friday_cols = BASE + ["prior_track_pace", "qsim_grid"]
    saturday_cols = BASE + ["prior_track_pace", "grid_position"]
    (fri_m, fri_res), (sat_m, _) = run(friday_cols), run(saturday_cols)

    # --- Non-model baselines (same held-out races) ---
    common = dict(race_col=RACE_COL, target_col="race_pace_delta", finish_col=FINISH,
                  min_train_races=min_train, ordered_races=ordered)
    stand_bl = evaluate_predictions(static_baseline(df, "champ_rank_before", **common))
    grid_bl = evaluate_predictions(static_baseline(df, "grid_position", **common))

    print("\n=== MODES vs BASELINES (held-out top-3) ===")
    print(f"  Standings-order baseline ......... {stand_bl['top3']:.3f}")
    print(f"  FRIDAY  classifier (qsim grid) ... {fri_m['top3']:.3f}  brier={fri_m['brier']:.3f}")
    print(f"  SATURDAY classifier (actual grid)  {sat_m['top3']:.3f}  brier={sat_m['brier']:.3f}")
    print(f"  Grid-order baseline (Saturday) ... {grid_bl['top3']:.3f}")

    # --- Reliability of the FRIDAY probabilities (calibration check) ---
    proba = np.concatenate([r["proba"] for r in fri_res])
    outcome = np.concatenate([(r["finish_pos"] <= 3).astype(float) for r in fri_res])
    print("\n=== FRIDAY probability reliability (pooled held-out) ===")
    for lo, hi in [(0.0, 0.2), (0.2, 0.5), (0.5, 1.01)]:
        sel = (proba >= lo) & (proba < hi)
        if sel.sum():
            print(f"  pred {lo:.1f}-{hi:.1f}: mean_pred={proba[sel].mean():.2f} "
                  f"actual_rate={outcome[sel].mean():.2f}  (n={int(sel.sum())})")

    # --- Verdict ---
    d_edge = fri_m["top3"] - run(BASE + ["prior_track_pace"])[0]["top3"]
    print("\n=== SECONDARY VERDICT ===")
    print(f"  FRIDAY {fri_m['top3']:.3f} vs standings baseline {stand_bl['top3']:.3f} "
          f"(Δ {fri_m['top3'] - stand_bl['top3']:+.3f})")
    print(f"  Quali-sim-grid edge over standings+form+track: Δtop3 {d_edge:+.3f}")
    print(f"  SATURDAY {sat_m['top3']:.3f} vs grid baseline {grid_bl['top3']:.3f} "
          f"(actual grid tightens FRIDAY by {sat_m['top3'] - fri_m['top3']:+.3f})")


if __name__ == "__main__":
    main()
