"""Tests for the finishing-order endpoint (M5 — actuals source for calibration)."""
from api.results import results_response


def test_returns_finish_order_for_a_completed_race():
    status, payload = results_response(2024, "Italy")
    assert status == 200
    assert isinstance(payload["finishOrder"], list)
    assert len(payload["finishOrder"]) > 0  # a known completed race


def test_missing_fields_is_400():
    status, payload = results_response(None, "Italy")
    assert status == 400


def test_non_integer_year_is_400():
    status, payload = results_response("soon", "Italy")
    assert status == 400


def test_unrun_race_is_empty_not_error():
    # A race with no results in the bundled table returns 200 + empty, not an error. Use a
    # far-future season so the assertion can't go stale as real races run (an earlier version
    # hardcoded 2026 Austria, which then actually ran and started returning a full order).
    status, payload = results_response(2099, "Austria")
    assert status == 200
    assert payload["finishOrder"] == []
