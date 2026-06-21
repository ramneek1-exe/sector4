"""Tests for the Vercel Python pace endpoint (M4 live inference)."""
from api.pace import pace_response


def test_pace_2024_italy_returns_ranked_gaps_with_team():
    status, payload = pace_response({"year": 2024, "gp": "Italy"})
    assert status == 200
    assert payload["qualitative"] is False
    assert len(payload["drivers"]) > 0
    top = payload["drivers"][0]
    assert {"driver", "pace_delta_s", "uncertainty_s", "team"} <= set(top)
    # sorted fastest-first (lower delta = faster)
    deltas = [d["pace_delta_s"] for d in payload["drivers"]]
    assert deltas == sorted(deltas)


def test_pace_missing_fields_is_400():
    status, payload = pace_response({"gp": "Italy"})
    assert status == 400
    assert "error" in payload


def test_pace_non_integer_year_is_400():
    status, payload = pace_response({"year": "soon", "gp": "Italy"})
    assert status == 400
