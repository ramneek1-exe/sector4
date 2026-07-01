import pandas as pd

from src.features.actual_stops import race_stop_distribution


def _laps(stints_by_driver):
    # one row per (driver, stint); count_stops uses nunique(Stint) - 1
    rows = []
    for drv, n_stints in stints_by_driver.items():
        for s in range(1, n_stints + 1):
            rows.append({"Driver": drv, "Stint": s})
    return pd.DataFrame(rows)


def test_distribution_modal_and_range():
    # VER 2 stints -> 1 stop; HAM,LEC 3 stints -> 2 stops; RUS 3 stints -> 2 stops
    laps = _laps({"VER": 2, "HAM": 3, "LEC": 3, "RUS": 3})
    d = race_stop_distribution(laps)
    assert d["modal_stops"] == 2
    assert d["n_drivers"] == 4
    assert d["n_at_modal"] == 3
    assert d["stops_min"] == 1
    assert d["stops_max"] == 2
