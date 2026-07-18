"""predict_podium — M3 headline: calibrated podium probabilities as honest bands.

Reads ONLY the persisted podium feature table (no fastf1) and trains a logistic
model on strictly prior weekends via store.prior_weekends (the leakage chokepoint,
calendar order). The product surface is qualitative bands; the numeric p_podium is
returned but flagged `calibrated: false` so the %-upgrade is pre-wired for when 2026
calibration matures (spec §5). Sharpens Friday -> Saturday: Saturday adds the actual
grid. Numbers rounded at the boundary. (spec §6, §7)
"""
from __future__ import annotations

import pandas as pd

from src import store
from src.calendar import race_id
from src.inference.stickiness import circuit_grid_stickiness, grid_context_line
from src.models.podium_model import band_for, default_classifier_factory

# Feature columns declared here (NOT imported from feature-build modules) to keep
# this module's import graph fastf1-free, matching pace.py's pattern.
BASE_COLS = ["champ_rank_before", "champ_points_before", "form_finish_avg3"]
FRIDAY_COLS = BASE_COLS + ["prior_track_pace"]
SATURDAY_COLS = FRIDAY_COLS + ["grid_position"]
MIN_TRAIN_RACES = 8  # the validated rolling-origin warmup (spec §2)


def _driver_factors(row: pd.Series, saturday: bool) -> dict:
    """The grounded signals behind one driver's band — the 'why' the narrative explains.

    These are the model's own inputs (never race-derived for that race), surfaced so the
    narrative can speak in real terms (standings, recent form, track history, grid) instead
    of reciting probabilities. Conventions: champ_rank 1 = leader; recent_form_avg_finish is
    the mean finishing position over the last 3 races (lower = better); track_pace_delta_s is
    the driver's historical race-pace gap AT THIS TRACK (negative = faster than average).
    """
    f = {
        "champ_rank": int(round(float(row["champ_rank_before"]))),
        "recent_form_avg_finish": round(float(row["form_finish_avg3"]), 1),
        "track_pace_delta_s": round(float(row["prior_track_pace"]), 2),
    }
    if saturday and pd.notna(row.get("grid_position")):
        f["grid"] = int(round(float(row["grid_position"])))
    return f


def _resolve_mode(target: pd.DataFrame, mode: str) -> str:
    """Resolve the prediction mode against grid availability.

    Saturday needs a COMPLETE grid (it is a feature), so both `auto` and an explicit
    `saturday` degrade to Friday when any target grid is missing — Friday is exactly
    the pre-grid mode, and this keeps a NaN out of the model. Explicit `friday` always
    stays Friday.
    """
    if mode == "friday":
        return "friday"
    has_grid = "grid_position" in target and target["grid_position"].notna().all()
    return "saturday" if has_grid else "friday"


def predict_podium(year: int, gp: str, mode: str = "auto",
                   table: pd.DataFrame | None = None,
                   model_factory=default_classifier_factory) -> dict:
    """Per-driver podium band (+ flagged p_podium), sharpening Friday -> Saturday."""
    table = table if table is not None else store.read_table(store.PODIUM_TABLE)
    target = table[table["race_id"] == race_id(year, gp)]
    if target.empty:
        return {"year": year, "gp": gp, "qualitative": True, "calibrated": False,
                "reason": "no feature row for target weekend", "drivers": []}

    prior = store.prior_weekends(table, year, gp)
    n_train = int(prior["race_id"].nunique())
    if n_train < MIN_TRAIN_RACES or prior["podium"].nunique() < 2:
        return {"year": year, "gp": gp, "qualitative": True, "calibrated": False,
                "n_train_races": n_train,
                "reason": "too few prior weekends for a calibrated podium",
                "drivers": []}

    resolved = _resolve_mode(target, mode)
    cols = SATURDAY_COLS if resolved == "saturday" else FRIDAY_COLS

    model = model_factory()
    model.fit(prior[cols], prior["podium"])
    proba = model.predict_proba(target[cols])[:, 1]

    target = target.reset_index(drop=True)
    saturday = resolved == "saturday"
    drivers = []
    for (_, row), p in zip(target.iterrows(), proba):
        t = row["team"] if "team" in target else None
        drivers.append({
            "driver": row["Driver"], "team": (None if pd.isna(t) else t),
            "band": band_for(float(p)), "p_podium": round(float(p), 2),
            "factors": _driver_factors(row, saturday)})
    drivers.sort(key=lambda r: r["p_podium"], reverse=True)
    for i, d in enumerate(drivers, start=1):
        d["rank"] = i
    result = {"year": year, "gp": gp, "mode": resolved, "qualitative": True,
              "calibrated": False, "n_train_races": n_train, "drivers": drivers}
    if saturday:
        line = grid_context_line(
            circuit_grid_stickiness(table, gp, year), drivers)
        if line:
            result["grid_context"] = line
    return result
