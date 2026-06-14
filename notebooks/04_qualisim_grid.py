"""PRIMARY test: does quali-sim pace predict the GRID better than standings?

Hypothesis: low-fuel single-lap (quali-sim) pace predicts qualifying far better
than long-run pace predicts the race, because it's like-for-like. If so, a
Friday quali-sim -> predicted-grid gives a differentiated PRE-QUALI podium signal.

Reuses the 8-circuit set, leakage guards, Friday features (standings/form). FP2
laps are cached; Q sessions load results-only. Builds data/qualisim_table.parquet
for the secondary classifier stage.

Run from repo root:  python notebooks/04_qualisim_grid.py
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.load import is_dry_session, load_session
from src.data.results import load_results
from src.features.friday import add_friday_features
from src.features.qualisim import qualisim_delta, quali_target_from_results

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
TABLE_PATH = "data/qualisim_table.parquet"


def build_qualisim_table() -> pd.DataFrame:
    """Per-driver per-weekend: quali-sim delta (FP2) + actual quali order (Q)."""
    rows = []
    for year in YEARS:
        for gp in CIRCUITS:
            q = load_session(year, gp, "Q", laps=False)
            if q is None or q.results is None or q.results.empty:
                logging.warning("No quali for %s %s", year, gp)
                continue
            target = quali_target_from_results(q.results)

            fp = load_session(year, gp, "FP2")
            if fp is None or not is_dry_session(fp):
                continue
            qsim = qualisim_delta(fp.laps)
            if qsim.empty:
                continue

            wk = qsim.merge(target, on="Driver", how="inner")
            wk["year"], wk["gp"], wk["race_id"] = year, gp, f"{year}-{gp}"
            rows.append(wk)
            logging.info("Built %s %s: %d drivers", year, gp, len(wk))
    return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()


def per_race_rho(df, col_a, col_b):
    rhos = []
    for _, g in df.groupby("race_id"):
        if len(g) >= 5:
            rho, _ = spearmanr(g[col_a], g[col_b])
            if not np.isnan(rho):
                rhos.append(rho)
    return float(np.mean(rhos)) if rhos else float("nan")


def main():
    df = build_qualisim_table()
    if df.empty:
        raise SystemExit("No quali-sim data built.")
    results = load_results(YEARS)
    df = add_friday_features(df, results, GP_TO_EVENT)
    df["champ_rank_before"] = df["champ_rank_before"].fillna(10.5)
    df["form_finish_avg3"] = df["form_finish_avg3"].fillna(10.5)
    df.to_parquet(TABLE_PATH)

    held = df[df["year"].isin([2024, 2025])]
    print(f"\nBuilt quali-sim table: {len(df)} rows / {df['race_id'].nunique()} weekends "
          f"({held['race_id'].nunique()} held-out 2024-25).")

    print("\n=== PRIMARY: predicting the GRID (qualifying order) ===")
    print("Per-weekend Spearman rho vs actual qualifying position:")
    for scope, d in [("all weekends", df), ("held-out 2024-25", held)]:
        qsim = per_race_rho(d, "qsim_delta", "quali_pos")
        stand = per_race_rho(d, "champ_rank_before", "quali_pos")
        form = per_race_rho(d, "form_finish_avg3", "quali_pos")
        print(f"\n  [{scope}]")
        print(f"    Quali-sim pace -> grid : {qsim:+.3f}")
        print(f"    Standings      -> grid : {stand:+.3f}")
        print(f"    Recent form    -> grid : {form:+.3f}")

    # Continuous check: quali-sim delta vs pole gap (like-for-like, seconds).
    print(f"\n  Quali-sim delta vs pole-gap (seconds, all weekends): "
          f"{per_race_rho(df, 'qsim_delta', 'pole_gap'):+.3f}")

    qsim_h = per_race_rho(held, "qsim_delta", "quali_pos")
    stand_h = per_race_rho(held, "champ_rank_before", "quali_pos")
    print("\n=== PRIMARY VERDICT ===")
    print(f"  Quali-sim {qsim_h:+.3f} vs standings {stand_h:+.3f} at predicting grid "
          f"(Δ {qsim_h - stand_h:+.3f})")
    if qsim_h > stand_h + 0.05:
        print("  >>> Quali-sim predicts grid materially better than standings. "
              "Proceed to the Friday-mode podium classifier.")
    else:
        print("  >>> Quali-sim does NOT clearly beat standings at predicting grid.")
    return df


if __name__ == "__main__":
    main()
