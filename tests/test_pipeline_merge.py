"""Regression tests for the incremental live-season merge (src.pipeline.merge_refreshed).

Root cause of the 2026 stop-count outage: the old `_merge_live` dropped ALL current-season
rows from the committed base and appended only the freshly-built ones, so a refresh run whose
fresh build came back empty/partial (common in CI, which has no fastf1 cache) WIPED
previously-built 2026 rows. `merge_refreshed` must replace only the races the fresh build
actually produced, never destroy rows it did not.
"""
import pandas as pd

from src.pipeline import merge_refreshed


def _row(race_id, year, gp, val):
    return {"race_id": race_id, "year": year, "gp": gp, "val": val}


def test_empty_fresh_preserves_all_base_rows():
    # The regression case: a refresh whose fresh 2026 build is empty must NOT drop 2026 rows.
    base = pd.DataFrame([
        _row("2025-Italy", 2025, "Italy", 1),
        _row("2026-Australia", 2026, "Australia", 2),
        _row("2026-Japan", 2026, "Japan", 3),
    ])
    out = merge_refreshed(base, pd.DataFrame(), key="race_id")
    assert sorted(out["race_id"]) == ["2025-Italy", "2026-Australia", "2026-Japan"]


def test_partial_fresh_replaces_only_its_own_races():
    base = pd.DataFrame([
        _row("2025-Italy", 2025, "Italy", 1),
        _row("2026-Australia", 2026, "Australia", 2),   # will be refreshed
        _row("2026-Japan", 2026, "Japan", 3),           # NOT in fresh → must be kept
    ])
    fresh = pd.DataFrame([_row("2026-Australia", 2026, "Australia", 99)])  # updated value
    out = merge_refreshed(base, fresh, key="race_id").sort_values("race_id").reset_index(drop=True)
    assert list(out["race_id"]) == ["2025-Italy", "2026-Australia", "2026-Japan"]
    # Australia replaced with the fresh value; Japan preserved from base.
    assert out.loc[out["race_id"] == "2026-Australia", "val"].item() == 99
    assert out.loc[out["race_id"] == "2026-Japan", "val"].item() == 3


def test_fresh_adds_a_new_race():
    base = pd.DataFrame([_row("2026-Australia", 2026, "Australia", 2)])
    fresh = pd.DataFrame([_row("2026-Monaco", 2026, "Monaco", 5)])
    out = merge_refreshed(base, fresh, key="race_id")
    assert sorted(out["race_id"]) == ["2026-Australia", "2026-Monaco"]


def test_empty_base_returns_fresh():
    fresh = pd.DataFrame([_row("2026-Monaco", 2026, "Monaco", 5)])
    out = merge_refreshed(pd.DataFrame(), fresh, key="race_id")
    assert list(out["race_id"]) == ["2026-Monaco"]
