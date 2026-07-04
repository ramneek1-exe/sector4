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


def test_leaked_unraced_target_routes_to_upcoming_with_teams():
    # An un-raced target can leak into the bundled table with fabricated finish/podium but
    # a NULL team (fastf1 exposes future sessions). It must route to the upcoming builder
    # (real teams from season results), NOT be served as a historical null-team result.
    # Regression for the grey-helmet / wrong-podium bug (Great Britain 2026).
    status, payload = podium_response({"year": 2026, "gp": "Great Britain"})
    assert status == 200
    drivers = payload["drivers"]
    assert len(drivers) > 0
    assert all(d.get("team") for d in drivers), "no podium driver may have a null/empty team"


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


def test_upcoming_builds_runtime_prediction():
    # A known 2026 circuit with NO feature-table row -> runtime construction. Monaco is used
    # deliberately: as a street circuit it is structurally excluded from the FP-long-run
    # feature tables, so it never gains a row (unlike a race like Austria, which becomes
    # "historical" once it runs and is rebuilt). Pre-quali (no grid) resolves to Friday mode
    # and still returns a ranked field of honest bands.
    status, payload = podium_response({"year": 2026, "gp": "Monaco"})
    assert status == 200
    assert payload["mode"] == "friday"
    assert payload["calibrated"] is False
    assert len(payload["drivers"]) > 0
    assert payload["drivers"][0]["rank"] == 1
    assert payload["drivers"][0]["band"] in {"strong", "in contention", "outside shot"}


def test_upcoming_sharpens_to_saturday_with_grid():
    # A real post-quali grid covers the whole field; _resolve_mode needs every entry
    # driver to have a grid slot to switch to Saturday. Uses the same runtime-path circuit
    # (Monaco: known 2026 circuit, no feature-table row) as the Friday test above.
    import pandas as pd
    from src.inference.upcoming import latest_entry_list

    sr = pd.read_parquet("api/season_results.parquet")
    entry = latest_entry_list(sr, 2026)
    grid = {drv: i + 1 for i, drv in enumerate(entry)}
    status, payload = podium_response({"year": 2026, "gp": "Monaco", "grid": grid})
    assert status == 200
    assert payload["mode"] == "saturday"
