"""Tests for the Vercel Python inference endpoint (M2)."""
from api.inference import lookup_response


def test_monaco_pit_loss_round_trips():
    status, payload = lookup_response({"stat": "pit_loss", "gp": "Monaco"})
    assert status == 200
    assert payload["value"] == 19.5
    assert payload["units"] == "s"


def test_missing_fields_is_400():
    status, payload = lookup_response({"stat": "pit_loss"})
    assert status == 400
    assert "error" in payload


def test_unknown_stat_is_400():
    status, payload = lookup_response({"stat": "top_speed", "gp": "Monaco"})
    assert status == 400
    assert "error" in payload


def test_inference_tyre_deg_uses_bundled_strategy_table():
    status, payload = lookup_response({"stat": "tyre_deg", "gp": "Bahrain"})
    assert status == 200
    assert payload["stat"] == "tyre_deg"
    assert payload["value"] is not None
    assert payload["units"] == "s/lap"


def test_inference_stint_length_returns_laps():
    status, payload = lookup_response({"stat": "stint_length", "gp": "Spain"})
    assert status == 200
    assert payload["units"] == "laps"
    assert isinstance(payload["value"], int)


def test_inference_pit_loss_non_curated_is_honestly_unavailable():
    status, payload = lookup_response({"stat": "pit_loss", "gp": "Imola"})
    assert status == 200
    assert payload["value"] is None
