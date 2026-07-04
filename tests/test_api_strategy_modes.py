from datetime import datetime, timezone

import api.strategy as strat
from api.strategy import strategy_response, _race_concluded


def test_completed_race_returns_actual_mode():
    # Austria 2026 has an actual_stops row (it ran).
    status, p = strategy_response({"year": 2026, "gp": "Austria"})
    assert status == 200
    assert p["mode"] == "actual"
    assert p["dominant"]["n_stops"] >= 1
    assert p["dominant"]["n_drivers"] >= 1
    assert p["sc_caveat"] == ""  # SC caveat only on predicted mode


def test_race_concluded_gates_only_the_pending_target(monkeypatch):
    monkeypatch.setattr(
        strat, "_SCHEDULE",
        {"year": 2026, "gp": "Great Britain", "final": "2026-07-05T14:00:00Z"},
    )
    before = datetime(2026, 7, 4, tzinfo=timezone.utc)
    after = datetime(2026, 7, 6, tzinfo=timezone.utc)
    # The pending target is "not concluded" until its race finishes.
    assert _race_concluded(2026, "Great Britain", now=before) is False
    assert _race_concluded(2026, "Great Britain", now=after) is True
    # Any weekend that is not the current target is always treated as concluded.
    assert _race_concluded(2026, "Austria", now=before) is True
    assert _race_concluded(2025, "Great Britain", now=before) is True


def test_pending_target_is_never_served_a_fabricated_actual(monkeypatch):
    # An un-raced target can leak a row into actual_stops (fastf1 exposes future sessions).
    # Before the race finishes it must NOT be served as a completed "actual" result.
    monkeypatch.setattr(
        strat, "_SCHEDULE",
        {"year": 2026, "gp": "Great Britain", "final": "2099-01-01T00:00:00Z"},
    )
    status, p = strategy_response({"year": 2026, "gp": "Great Britain"})
    assert status == 200
    assert p["mode"] != "actual"
    # Once the race has concluded, the gate opens and the real actual is served.
    monkeypatch.setattr(
        strat, "_SCHEDULE",
        {"year": 2026, "gp": "Great Britain", "final": "2000-01-01T00:00:00Z"},
    )
    _, p2 = strategy_response({"year": 2026, "gp": "Great Britain"})
    assert p2["mode"] == "actual"


def test_missing_fields_is_400():
    status, p = strategy_response({"gp": "Austria"})
    assert status == 400
