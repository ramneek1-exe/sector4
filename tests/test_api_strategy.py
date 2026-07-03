"""Tests for the Vercel Python strategy endpoint (M4 live inference)."""
from api.strategy import strategy_response
from api.strategy import compound_response, route


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


def test_compound_response_requires_year_and_gp():
    assert compound_response({"gp": "Italy"})[0] == 400
    assert compound_response({"year": 2026})[0] == 400


def test_compound_response_rejects_non_integer_year():
    assert compound_response({"year": "soon", "gp": "Italy"})[0] == 400


def test_compound_response_returns_norm_shape():
    status, payload = compound_response({"year": 2026, "gp": "Italy"})
    assert status == 200
    assert payload["gp"] == "Italy"
    assert "compound" in payload  # SOFT/MEDIUM/HARD or None from the bundled table


def test_route_dispatches_compound_vs_stops():
    comp = route({"kind": "compound", "year": 2026, "gp": "Italy"})[1]
    assert "compound" in comp and "drivers" not in comp
    stops = route({"year": 2026, "gp": "Italy"})[1]
    assert "dominant" in stops  # stop-count shape, unchanged default
