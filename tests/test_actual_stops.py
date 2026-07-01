import pandas as pd

from src.features.actual_stops import race_stop_distribution


def _laps(stints_by_driver):
    # stints_by_driver: {driver: [compound per stint in order]}
    rows = []
    for drv, comps in stints_by_driver.items():
        for i, c in enumerate(comps, start=1):
            rows.append({"Driver": drv, "Stint": i, "Compound": c})
    return pd.DataFrame(rows)


def _results(classified_by_driver):
    # classified_by_driver: {driver: ClassifiedPosition string ("1".."20" or "R" for retired)}
    return pd.DataFrame([
        {"Abbreviation": drv, "ClassifiedPosition": pos}
        for drv, pos in classified_by_driver.items()
    ])


def test_counts_compound_changes_among_classified_finishers():
    laps = _laps({
        "VER": ["SOFT", "HARD"],                 # 1 change -> 1 stop
        "HAM": ["SOFT", "HARD", "SOFT"],         # 2 changes -> 2 stops
        "LEC": ["MEDIUM", "MEDIUM", "HARD"],     # phantom same-compound stint -> 1 real stop
        "RUS": ["SOFT", "HARD"],                 # 1 stop
        "BOT": ["SOFT"],                          # DNF (retired) -> excluded, no 0-stop pollution
    })
    results = _results({"VER": "1", "HAM": "2", "LEC": "3", "RUS": "4", "BOT": "R"})
    d = race_stop_distribution(laps, results)
    assert d["modal_stops"] == 1        # VER, LEC, RUS at 1; HAM at 2
    assert d["n_drivers"] == 4          # BOT excluded
    assert d["n_at_modal"] == 3
    assert d["stops_min"] == 1          # no 0-stop DNF row
    assert d["stops_max"] == 2
