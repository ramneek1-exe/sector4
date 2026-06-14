"""Model B spike: do FP deg features beat the track-norm baseline at predicting
strategy (stop count) and the dominant compound?

This is telemetry's best shot — tyre deg directly drives pit strategy, and deg is
exactly what FP long runs measure. Reuses the 8-circuit dry set, hardened Theil-Sen
deg slopes, rolling-origin CV (train 2023, predict 2024-25), leakage guards. Race
and FP2 sessions are already cached.

Run from repo root:  python notebooks/06_strategy_compound.py
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.load import is_dry_session, load_session
from src.eval.baseline import static_baseline
from src.features.pace import summarize_stints
from src.features.stints import long_run_stints
from src.features.strategy import count_stops, dominant_compound, sc_disruption_fraction
from src.features.track import track_features
from src.models.pace_model import rolling_origin_predict

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")

CIRCUITS = ["Bahrain", "Saudi Arabia", "Spain", "Hungary",
            "Italy", "Mexico City", "Las Vegas", "Abu Dhabi"]
YEARS = [2023, 2024, 2025]
SC_DISRUPT = 0.10  # >10% of laps under SC/VSC/red -> strategy distorted


def _track_temp(session):
    try:
        w = session.weather_data
        return float(w["TrackTemp"].median()) if w is not None and not w.empty else np.nan
    except Exception:
        return np.nan


def build_tables():
    driver_rows, race_rows = [], []
    for year in YEARS:
        for gp in CIRCUITS:
            race = load_session(year, gp, "R")
            if race is None or race.laps.empty:
                continue
            laps = race.laps
            stops = count_stops(laps)
            dom = dominant_compound(laps)
            sc = sc_disruption_fraction(laps)
            modal = int(stops["n_stops"].mode().iloc[0])

            fp = load_session(year, gp, "FP2")
            if fp is None or not is_dry_session(fp):
                continue
            summary = summarize_stints(long_run_stints(fp.laps))
            if summary.empty:
                continue
            deg_by_c = summary.groupby("compound")["slope"].median()
            deg_overall = float(summary["slope"].median())
            feas = int(summary["n_laps"].max())
            temp = _track_temp(fp)
            tf = track_features(gp)

            race_rows.append({
                "race_id": f"{year}-{gp}", "year": year, "gp": gp,
                "dominant_compound": dom, "modal_stops": modal, "sc_frac": sc,
                "deg_overall": deg_overall, "feas_max_stint": feas, "track_temp": temp,
                "deg_SOFT": deg_by_c.get("SOFT", np.nan),
                "deg_MEDIUM": deg_by_c.get("MEDIUM", np.nan),
                "deg_HARD": deg_by_c.get("HARD", np.nan),
                "pit_loss_s": tf["pit_loss_s"], "abrasiveness": tf["abrasiveness"],
            })
            for _, r in stops.iterrows():
                driver_rows.append({
                    "race_id": f"{year}-{gp}", "year": year, "gp": gp, "Driver": r["Driver"],
                    "n_stops": int(r["n_stops"]), "sc_frac": sc,
                    "deg_overall": deg_overall, "feas_max_stint": feas, "track_temp": temp,
                    "deg_SOFT": deg_by_c.get("SOFT", np.nan), "deg_MEDIUM": deg_by_c.get("MEDIUM", np.nan),
                    "deg_HARD": deg_by_c.get("HARD", np.nan),
                    "pit_loss_s": tf["pit_loss_s"], "abrasiveness": tf["abrasiveness"],
                })
    return pd.DataFrame(driver_rows), pd.DataFrame(race_rows)


def add_history(df, race_df):
    """Track-norm history from strictly prior years (leakage-safe)."""
    modal_hist, dom_hist = [], []
    for row in df.itertuples():
        prior = race_df[(race_df.gp == row.gp) & (race_df.year < row.year)]
        modal_hist.append(prior["modal_stops"].mode().iloc[0] if not prior.empty else np.nan)
        dom_hist.append(prior["dominant_compound"].mode().iloc[0] if not prior.empty else None)
    df = df.copy()
    df["hist_modal_stops"] = modal_hist
    df["hist_dominant"] = dom_hist
    return df


def acc_mae(results):
    t = np.concatenate([r["pace_true"] for r in results])
    p = np.concatenate([r["pace_pred"] for r in results])
    return float(np.mean(np.round(p) == t)), float(np.mean(np.abs(p - t)))


def main():
    driver_df, race_df = build_tables()
    ordered = [f"{y}-{gp}" for y in YEARS for gp in CIRCUITS if f"{y}-{gp}" in set(driver_df["race_id"])]
    min_train = sum(r.startswith("2023") for r in ordered)
    n_disrupt = (race_df[race_df.year >= 2024]["sc_frac"] > SC_DISRUPT).sum()
    print(f"Built {len(driver_df)} driver-rows / {len(race_df)} weekends. "
          f"Held-out {len(ordered)-min_train}; {n_disrupt} held-out races SC-disrupted (>{SC_DISRUPT:.0%}).")

    # History features. 2023 rows have no prior year -> impute with the 2023-wide
    # modal stop count (an aggregate prior, not the race's own value).
    driver_df = add_history(driver_df, race_df)
    global_modal = float(race_df[race_df.year == 2023]["modal_stops"].median())
    driver_df["hist_modal_stops"] = driver_df["hist_modal_stops"].fillna(global_modal)
    for c in ["deg_SOFT", "deg_MEDIUM", "deg_HARD"]:
        driver_df[c] = driver_df[c].fillna(driver_df["deg_overall"])
    driver_df["track_temp"] = driver_df["track_temp"].fillna(driver_df["track_temp"].median())

    # ===== PART 1 — STRATEGY (per-driver stop count) =====
    TARGET, RACE_COL, FINISH = "n_stops", "race_id", "n_stops"
    BASE_TRACK = ["pit_loss_s", "abrasiveness", "track_temp", "hist_modal_stops"]
    FP_DEG = ["deg_overall", "deg_SOFT", "deg_MEDIUM", "deg_HARD", "feas_max_stint"]
    common = dict(race_col=RACE_COL, target_col=TARGET, finish_col=FINISH,
                  min_train_races=min_train, ordered_races=ordered)

    base_bl = static_baseline(driver_df, "hist_modal_stops", **common)
    a1 = rolling_origin_predict(driver_df, BASE_TRACK, TARGET, RACE_COL, FINISH,
                                min_train_races=min_train, ordered_races=ordered)
    a2 = rolling_origin_predict(driver_df, BASE_TRACK + FP_DEG, TARGET, RACE_COL, FINISH,
                                min_train_races=min_train, ordered_races=ordered)

    print("\n=== PART 1: STRATEGY (stop count) — held-out 2024-25 ===")
    print(f"{'Predictor':<34}{'Acc':>7}{'MAE':>8}")
    for name, res in [("Track-norm baseline (modal)", base_bl),
                      ("Model: track features (no FP)", a1),
                      ("Model: track + FP deg", a2)]:
        acc, mae = acc_mae(res)
        print(f"  {name:<32}{acc:6.3f}{mae:8.3f}")

    # planned-strategy view: drop SC-disrupted held-out races
    keep = set(race_df[race_df.sc_frac <= SC_DISRUPT]["race_id"])
    ordered_clean = [r for r in ordered if r in keep or r.startswith("2023")]
    a2c = rolling_origin_predict(driver_df, BASE_TRACK + FP_DEG, TARGET, RACE_COL, FINISH,
                                 min_train_races=min_train, ordered_races=ordered_clean)
    blc = static_baseline(driver_df, "hist_modal_stops", race_col=RACE_COL, target_col=TARGET,
                          finish_col=FINISH, min_train_races=min_train, ordered_races=ordered_clean)
    acc2c, mae2c = acc_mae(a2c); accbc, maebc = acc_mae(blc)
    print(f"  [planned only, SC-clean] baseline acc={accbc:.3f} | track+FP deg acc={acc2c:.3f}")

    # ===== PART 2 — DOMINANT COMPOUND (race-level) =====
    race_df2 = add_history(race_df, race_df)
    for c in ["deg_SOFT", "deg_MEDIUM", "deg_HARD"]:
        race_df2[c] = race_df2[c].fillna(race_df2["deg_overall"])
    race_df2["track_temp"] = race_df2["track_temp"].fillna(race_df2["track_temp"].median())
    rd = race_df2[race_df2["race_id"].isin(ordered)].set_index("race_id").loc[ordered].reset_index()

    feat_cols = ["deg_overall", "deg_SOFT", "deg_MEDIUM", "deg_HARD",
                 "abrasiveness", "track_temp", "pit_loss_s"]
    base_correct, model_correct, n = 0, 0, 0
    for i in range(min_train, len(rd)):
        train, test = rd.iloc[:i], rd.iloc[i]
        # baseline: historically dominant compound at this circuit
        if test["hist_dominant"] is None or (isinstance(test["hist_dominant"], float) and np.isnan(test["hist_dominant"])):
            base_pred = train["dominant_compound"].mode().iloc[0]
        else:
            base_pred = test["hist_dominant"]
        base_correct += int(base_pred == test["dominant_compound"])
        # model: classifier on FP deg + track features
        if train["dominant_compound"].nunique() >= 2:
            clf = RandomForestClassifier(n_estimators=200, random_state=0)
            clf.fit(train[feat_cols], train["dominant_compound"])
            model_pred = clf.predict(test[feat_cols].to_frame().T)[0]
        else:
            model_pred = train["dominant_compound"].mode().iloc[0]
        model_correct += int(model_pred == test["dominant_compound"])
        n += 1

    print("\n=== PART 2: DOMINANT COMPOUND (race-level) — held-out 2024-25 ===")
    print(f"  Track-norm baseline (historical dominant): {base_correct}/{n} = {base_correct/n:.3f}")
    print(f"  Model (FP deg + track features):           {model_correct}/{n} = {model_correct/n:.3f}")
    print(f"  Compound distribution (held-out): {rd.iloc[min_train:]['dominant_compound'].value_counts().to_dict()}")

    # ===== VERDICTS =====
    acc1_bl, _ = acc_mae(base_bl); acc1_m, _ = acc_mae(a2)
    print("\n=== DECISION GATE ===")
    print(f"  PART 1 strategy: FP+track {acc1_m:.3f} vs track-norm {acc1_bl:.3f} "
          f"(Δ {acc1_m - acc1_bl:+.3f})")
    print(f"  PART 2 compound: model {model_correct/n:.3f} vs track-norm {base_correct/n:.3f} "
          f"(Δ {(model_correct-base_correct)/n:+.3f})")


if __name__ == "__main__":
    main()
