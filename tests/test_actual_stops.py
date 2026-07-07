import pandas as pd

from src import pipeline
from src.calendar import RACE_CALENDAR
from src.features.actual_stops import race_stop_distribution, STOPS_CIRCUITS


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


def test_live_season_skips_rounds_beyond_the_derived_calendar(monkeypatch):
    # build_actual_stops only builds rounds in the derived live calendar (completed rounds +
    # the single upcoming target); a round BEYOND the target is never even attempted. The
    # upcoming TARGET itself is now gated by the date-gate in load_session (which returns
    # None for a future session — see tests/test_load_gate.py), so it may be attempted here
    # but yields no row. Past-season circuits always load.
    live = max(RACE_CALENDAR)
    in_cal = RACE_CALENDAR[live][0]  # a completed round
    # a full-roster circuit that is beyond the derived calendar (not completed, not the target)
    beyond = next(c for c in STOPS_CIRCUITS if c not in RACE_CALENDAR[live])

    loaded = []

    def fake_load_session(year, gp, session):
        loaded.append((year, gp))
        return None  # no laps -> row skipped; we only care WHICH races were attempted

    monkeypatch.setattr(pipeline, "load_session", fake_load_session)
    pipeline.build_actual_stops([live], [beyond, in_cal])
    assert (live, beyond) not in loaded   # beyond the derived calendar: never attempted
    assert (live, in_cal) in loaded       # a completed round is attempted


def test_leaked_target_laps_with_no_classification_produce_no_row(monkeypatch):
    # The live target (RACE_CALENDAR[live][-1]) IS in the completed-gate list by design (the
    # "issue predictions before the race" calendar), so build_actual_stops attempts to load it.
    # If fastf1 leaks pre-race laps for it (as observed for British R9) and results carry no
    # classification, race_stop_distribution must fail CLOSED so no bogus row is emitted.
    live = max(RACE_CALENDAR)
    target = RACE_CALENDAR[live][-1]

    class FakeSession:
        def __init__(self, laps, results):
            self.laps = laps
            self.results = results

    leaked_laps = _laps({
        "VER": ["SOFT", "HARD"],
        "HAM": ["SOFT", "MEDIUM"],
    })
    # Results with no ClassifiedPosition column at all -> cannot classify.
    leaked_results = pd.DataFrame([
        {"Abbreviation": "VER"},
        {"Abbreviation": "HAM"},
    ])

    def fake_load_session(year, gp, session):
        if (year, gp) == (live, target):
            return FakeSession(leaked_laps, leaked_results)
        return None

    monkeypatch.setattr(pipeline, "load_session", fake_load_session)
    out = pipeline.build_actual_stops([live], [target])
    assert out.empty or out[out["gp"] == target].empty
