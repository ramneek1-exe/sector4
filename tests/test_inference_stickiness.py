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
    # a mild shuffle: swap adjacent pairs -> positive but not extreme
    swap = {1: 2, 2: 1, 3: 4, 4: 3, 5: 6, 6: 5}
    df = _runnings("Spain", [2023, 2024, 2025], grid_to_finish=lambda g: swap[g])
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
