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


def test_podium_handler_includes_team():
    status, payload = podium_response({"year": 2024, "gp": "Italy"})
    assert status == 200
    assert "team" in payload["drivers"][0]


def test_upcoming_2026_austria_builds_runtime_prediction():
    # No table row for the live target -> runtime construction. Pre-quali (no grid)
    # resolves to Friday mode and still returns a ranked field of honest bands.
    status, payload = podium_response({"year": 2026, "gp": "Austria"})
    assert status == 200
    assert payload["mode"] == "friday"
    assert payload["calibrated"] is False
    assert len(payload["drivers"]) > 0
    assert payload["drivers"][0]["rank"] == 1
    assert payload["drivers"][0]["band"] in {"strong", "in contention", "outside shot"}


def test_upcoming_sharpens_to_saturday_with_grid():
    # A real post-quali grid covers the whole field; _resolve_mode needs every entry
    # driver to have a grid slot to switch to Saturday.
    import pandas as pd
    from src.inference.upcoming import latest_entry_list

    sr = pd.read_parquet("api/season_results.parquet")
    entry = latest_entry_list(sr, 2026)
    grid = {drv: i + 1 for i, drv in enumerate(entry)}
    status, payload = podium_response({"year": 2026, "gp": "Austria", "grid": grid})
    assert status == 200
    assert payload["mode"] == "saturday"
