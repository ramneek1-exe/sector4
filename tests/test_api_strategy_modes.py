from api.strategy import strategy_response


def test_completed_race_returns_actual_mode():
    # Austria 2026 has an actual_stops row (it ran).
    status, p = strategy_response({"year": 2026, "gp": "Austria"})
    assert status == 200
    assert p["mode"] == "actual"
    assert p["dominant"]["n_stops"] >= 1
    assert p["dominant"]["n_drivers"] >= 1
    assert p["sc_caveat"] == ""  # SC caveat only on predicted mode


def test_upcoming_next_race_returns_historical_mode():
    # Great Britain has no 2026 row and no dry-FP row -> historical norm.
    status, p = strategy_response({"year": 2026, "gp": "Great Britain"})
    assert status == 200
    assert p["mode"] == "historical"
    assert p["dominant"]["n_stops"] >= 1


def test_missing_fields_is_400():
    status, p = strategy_response({"gp": "Austria"})
    assert status == 400
