import pandas as pd
import pytest

from scripts.build_2026 import assert_no_unraced_target


def _tbl(gps):
    return pd.DataFrame({"year": [2026] * len(gps), "gp": gps, "Driver": ["X"] * len(gps)})


def test_raises_when_unraced_target_present():
    tables = {"podium": _tbl(["Austria", "Belgium"])}
    with pytest.raises(RuntimeError, match="Belgium"):
        assert_no_unraced_target(tables, "Belgium", target_raced=False, live_season=2026)


def test_ok_when_target_absent():
    tables = {"podium": _tbl(["Austria", "Great Britain"])}
    assert_no_unraced_target(tables, "Belgium", target_raced=False, live_season=2026)  # no raise


def test_ok_when_target_has_raced():
    tables = {"podium": _tbl(["Austria", "Belgium"])}
    assert_no_unraced_target(tables, "Belgium", target_raced=True, live_season=2026)  # concluded -> allowed


def test_raises_when_unraced_target_present_by_long_event_name():
    # season_results keys gp by fastf1's long EventName; the assertion must still catch it.
    tables = {"season_results": pd.DataFrame({"year": [2026, 2026], "gp": ["Austrian Grand Prix", "Belgian Grand Prix"], "Driver": ["X", "Y"]})}
    with pytest.raises(RuntimeError, match="Belgian Grand Prix|Belgium"):
        assert_no_unraced_target(tables, "Belgium", target_raced=False, live_season=2026)
