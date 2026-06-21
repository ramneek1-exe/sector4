"""attach_teams — year-correct team enrichment for driver glyphs (M4).

Team is glyph METADATA, never a model input, so this join happens at the serverless
boundary (like build_podium_table bakes team into the podium table). fastf1-free and
sklearn-free; pandas only.
"""
from __future__ import annotations

import pandas as pd


def attach_teams(drivers: list[dict], team_map: pd.DataFrame,
                 year: int, gp: str) -> list[dict]:
    """Return each driver dict with a 'team' key (str, or None if unknown)."""
    sub = team_map[(team_map["year"] == year) & (team_map["gp"] == gp)]
    by_code = dict(zip(sub["Driver"], sub["team"]))
    out = []
    for d in drivers:
        team = by_code.get(d["driver"])
        out.append({**d, "team": None if team is None or pd.isna(team) else team})
    return out
