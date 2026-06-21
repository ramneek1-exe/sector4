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
    status, payload = results_response(2026, "Austria")  # not yet run
    assert status == 200
    assert payload["finishOrder"] == []
