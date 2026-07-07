from api.strategy import strategy_response


def test_completed_race_returns_actual_mode():
    # A completed race has an actual_stops row.
    status, p = strategy_response({"year": 2024, "gp": "Italy"})
    assert status == 200
    assert p["mode"] == "actual"
    assert p["dominant"]["n_stops"] >= 1


def test_upcoming_or_absent_returns_historical_norm():
    # A future/absent season has no actual + no strategy row -> honest historical norm.
    status, p = strategy_response({"year": 2027, "gp": "Great Britain"})
    assert status == 200
    assert p["mode"] == "historical"
    assert p["dominant"]["n_stops"] >= 1


def test_missing_fields_is_400():
    status, p = strategy_response({"gp": "Austria"})
    assert status == 400
