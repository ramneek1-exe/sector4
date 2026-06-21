# src/inference/lookup.py
"""lookup_stat — computed-stat lookups (design §7). No ML, no fastf1.

pit_loss reads curated track features; tyre_deg / stint_length read the persisted
strategy feature table. Numbers are rounded at the boundary (house rule).
"""
from __future__ import annotations

import pandas as pd

from src import store
from src.features.track import CURATED_TRACKS, track_features

PIT_LOSS = "pit_loss"
TYRE_DEG = "tyre_deg"
STINT_LENGTH = "stint_length"


def lookup_stat(stat: str, gp: str, table: pd.DataFrame | None = None) -> dict:
    """Return a computed stat for a circuit as a typed, rounded dict."""
    if stat == PIT_LOSS:
        if gp not in CURATED_TRACKS:
            return {"stat": stat, "gp": gp, "value": None, "units": None,
                    "source": "not available for this circuit"}
        tf = track_features(gp)
        return {"stat": stat, "gp": gp, "value": round(float(tf["pit_loss_s"]), 1),
                "units": "s", "source": "curated track features"}

    if stat not in (TYRE_DEG, STINT_LENGTH):
        raise ValueError(f"unknown stat: {stat!r}")

    table = table if table is not None else store.read_table(store.STRATEGY_TABLE)
    rows = table[table["gp"] == gp]
    if rows.empty:
        return {"stat": stat, "gp": gp, "value": None, "units": None,
                "source": "no FP data for circuit"}

    if stat == TYRE_DEG:
        return {"stat": stat, "gp": gp,
                "value": round(float(rows["deg_overall"].median()), 3),
                "units": "s/lap", "source": "FP long-run Theil-Sen deg"}
    # STINT_LENGTH
    return {"stat": stat, "gp": gp, "value": int(rows["feas_max_stint"].max()),
            "units": "laps", "source": "FP longest clean stint"}
