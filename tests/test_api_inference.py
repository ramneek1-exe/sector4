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
