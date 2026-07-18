"""Tests for grid-stickiness context (per-track overtaking difficulty)."""
import numpy as np
import pandas as pd

from src.inference.stickiness import circuit_grid_stickiness


def _runnings(gp, years, *, grid_to_finish):
    """Synthetic podium_features rows: for each year, 6 drivers whose finish is a
    function of grid via `grid_to_finish` (a callable position->position)."""
    rows = []
    for y in years:
        for grid in range(1, 7):
            rows.append({
                "race_id": f"{y}-{gp}", "year": y, "gp": gp,
                "grid_position": float(grid),
                "finish_pos": float(grid_to_finish(grid)),
            })
    return pd.DataFrame(rows)


def test_sticky_circuit_high_rho():
    # finish == grid -> perfect rank correlation -> sticky
    df = _runnings("Monaco", [2023, 2024, 2025], grid_to_finish=lambda g: g)
    out = circuit_grid_stickiness(df, "Monaco", 2026)
    assert out["tier"] == "sticky"
    assert out["score"] >= 0.80
    assert out["n"] == 3


def test_high_overtaking_circuit_low_rho():
    # finish reverses grid -> strong NEGATIVE rank corr; but stickiness is about how
    # well grid predicts finish ORDER, so we use the correlation sign as-is: reversed
    # grids are chaotic relative to "hold position" -> low/negative -> high_overtaking.
    df = _runnings("Vegas", [2023, 2024, 2025], grid_to_finish=lambda g: 7 - g)
    out = circuit_grid_stickiness(df, "Vegas", 2026)
    assert out["tier"] == "high_overtaking"
    assert out["score"] < 0.60


def test_average_circuit_mid_rho():
    # a moderate shuffle -> spearman rho ~0.66 (verified): positive but not extreme
    shift = {1: 2, 2: 3, 3: 1, 4: 5, 5: 6, 6: 4}
    df = _runnings("Spain", [2023, 2024, 2025], grid_to_finish=lambda g: shift[g])
    out = circuit_grid_stickiness(df, "Spain", 2026)
    assert out["tier"] == "average"
    assert 0.60 <= out["score"] < 0.80


def test_thin_history_returns_none():
    df = _runnings("NewTrack", [2025], grid_to_finish=lambda g: g)  # 1 running
    assert circuit_grid_stickiness(df, "NewTrack", 2026) is None


def test_leakage_target_year_excluded():
    # A chaotic 2026 running must NOT influence the pre-2026 sticky estimate.
    sticky = _runnings("Monaco", [2023, 2024, 2025], grid_to_finish=lambda g: g)
    leak = _runnings("Monaco", [2026], grid_to_finish=lambda g: 7 - g)
    df = pd.concat([sticky, leak], ignore_index=True)
    out = circuit_grid_stickiness(df, "Monaco", 2026)
    assert out["n"] == 3           # only 2023-2025 counted
    assert out["tier"] == "sticky"


def test_no_rows_for_circuit_returns_none():
    df = _runnings("Monaco", [2023, 2024], grid_to_finish=lambda g: g)
    assert circuit_grid_stickiness(df, "Suzuka", 2026) is None


from src.inference.stickiness import grid_context_line


def _drivers(*grids):
    return [{"factors": {"grid": g}} for g in grids]


def test_line_fires_for_sticky_with_front_row():
    st = {"score": 0.9, "tier": "sticky", "n": 4}
    line = grid_context_line(st, _drivers(1, 5, 8))
    assert line is not None
    assert "hardest" in line.lower() or "hard to overtake" in line.lower()
    assert "—" not in line and "–" not in line  # no em/en dashes


def test_line_fires_for_high_overtaking_with_front_row():
    st = {"score": 0.45, "tier": "high_overtaking", "n": 4}
    line = grid_context_line(st, _drivers(2, 4, 6))
    assert line is not None
    assert "passing" in line.lower() or "overtak" in line.lower()


def test_line_silent_for_average_tier():
    st = {"score": 0.7, "tier": "average", "n": 4}
    assert grid_context_line(st, _drivers(1, 2, 3)) is None


def test_line_silent_without_front_row_driver():
    st = {"score": 0.9, "tier": "sticky", "n": 4}
    assert grid_context_line(st, _drivers(5, 6, 7)) is None


def test_line_silent_when_stickiness_none():
    assert grid_context_line(None, _drivers(1, 2)) is None


def test_line_silent_when_no_grid_in_factors():
    # Friday-shaped drivers (no grid key) never trigger.
    st = {"score": 0.9, "tier": "sticky", "n": 4}
    assert grid_context_line(st, [{"factors": {}}]) is None
