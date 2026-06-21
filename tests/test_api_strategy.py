"""Tests for the Vercel Python strategy endpoint (M4 live inference)."""
from api.strategy import strategy_response


def test_strategy_2024_bahrain_returns_dominant_caveat_and_teams():
    status, payload = strategy_response({"year": 2024, "gp": "Bahrain"})
    assert status == 200
    assert payload["sc_caveat"]  # always present and non-empty
    if payload["qualitative"] is False:
        assert payload["dominant"]["n_drivers"] > 0
        top = payload["drivers"][0]
        assert {"driver", "n_stops", "confidence", "team"} <= set(top)
    else:
        assert payload["dominant"] is None


def test_strategy_missing_fields_is_400():
    status, payload = strategy_response({"gp": "Bahrain"})
    assert status == 400
    assert "error" in payload


def test_strategy_non_integer_year_is_400():
    status, payload = strategy_response({"year": "soon", "gp": "Bahrain"})
    assert status == 400
