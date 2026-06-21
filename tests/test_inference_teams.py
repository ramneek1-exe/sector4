"""Tests for attach_teams — year-correct team enrichment (glyph metadata, M4)."""
import pandas as pd

from src.inference.teams import attach_teams


def _team_map():
    return pd.DataFrame(
        {
            "year": [2024, 2024, 2023],
            "gp": ["Italy", "Italy", "Italy"],
            "Driver": ["VER", "NOR", "VER"],
            "team": ["Red Bull Racing", "McLaren", "Red Bull Racing"],
        }
    )


def test_attach_teams_adds_year_correct_team():
    drivers = [{"driver": "VER", "n_stops": 1}, {"driver": "NOR", "n_stops": 2}]
    out = attach_teams(drivers, _team_map(), 2024, "Italy")
    assert out[0]["team"] == "Red Bull Racing"
    assert out[1]["team"] == "McLaren"
    # original keys preserved
    assert out[0]["n_stops"] == 1


def test_attach_teams_uses_none_when_missing():
    drivers = [{"driver": "HAM"}]
    out = attach_teams(drivers, _team_map(), 2024, "Italy")
    assert out[0]["team"] is None
