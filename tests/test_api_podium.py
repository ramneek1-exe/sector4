"""Tests for the Vercel Python podium endpoint (M3 live inference)."""
from api.podium import podium_response


def test_podium_2024_italy_returns_ranked_bands():
    status, payload = podium_response({"year": 2024, "gp": "Italy"})
    assert status == 200
    assert payload["qualitative"] is True
    assert payload["calibrated"] is False
    assert payload["mode"] == "saturday"  # grid present for a historical race
    assert len(payload["drivers"]) > 0
    top = payload["drivers"][0]
    assert top["rank"] == 1
    assert top["band"] in {"strong", "in contention", "outside shot"}
    assert 0.0 <= top["p_podium"] <= 1.0


def test_podium_missing_fields_is_400():
    status, payload = podium_response({"gp": "Italy"})
    assert status == 400
    assert "error" in payload


def test_podium_non_integer_year_is_400():
    status, payload = podium_response({"year": "soon", "gp": "Italy"})
    assert status == 400
    assert "error" in payload


def test_podium_unknown_circuit_is_qualitative_not_error():
    status, payload = podium_response({"year": 2024, "gp": "Narnia"})
    assert status == 200
    assert payload["qualitative"] is True
    assert payload["drivers"] == []
