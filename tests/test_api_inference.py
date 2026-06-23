"""Tests for the Vercel Python inference endpoint (M2)."""
from api.inference import lookup_response


def test_monaco_pit_loss_round_trips():
    status, payload = lookup_response({"stat": "pit_loss", "gp": "Monaco"})
    assert status == 200
    # Derived from race data now (not a curated constant): a real number in seconds,
    # year-stamped, with grounded insights.
    assert isinstance(payload["value"], float)
    assert 15.0 < payload["value"] < 30.0
    assert payload["units"] == "s"
    assert isinstance(payload["year"], int)
    assert payload["insights"] and any("tyre change" in i.lower() for i in payload["insights"])


def test_pit_loss_year_selects_that_season():
    latest = lookup_response({"stat": "pit_loss", "gp": "Austria"})[1]
    pinned = lookup_response({"stat": "pit_loss", "gp": "Austria", "year": 2024})[1]
    assert pinned["year"] == 2024
    # Default (no year) returns the most recent season we hold, i.e. >= the pinned one.
    assert latest["year"] >= pinned["year"]


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
