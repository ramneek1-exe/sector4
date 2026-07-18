"""Per-track grid-stickiness context for the podium narrative (M7).

Grid->finish "stickiness" = how strongly starting position predicts finishing
position at a circuit (Spearman rank correlation over its PRIOR runnings). It is
NOT a model input (a validated NO-GO, spec 2026-07-17 §0) — only a grounded,
deterministic sentence the narrative may weave in: front-row starts count for more
at hard-to-overtake tracks, less at high-overtaking ones.

Pure pandas; no fastf1, no scipy. Reads only the passed podium_features frame.
"""
from __future__ import annotations

import pandas as pd

# Thresholds anchored to the observed 2023-2026 spread (rho ~0.43 Las Vegas ..
# ~0.90 Monaco/Japan). Extremes speak; the broad middle stays silent (average).
STICKY_MIN = 0.80
HIGH_OVERTAKING_MAX = 0.60
MIN_RUNNINGS = 2  # honesty gate: below this we cannot say anything trustworthy


def circuit_grid_stickiness(podium_features: pd.DataFrame, gp: str,
                            year: int) -> dict | None:
    """Shrink-free Spearman rho(grid, finish) over strictly-prior runnings of `gp`.

    Returns {"score", "tier", "n"} or None when there are fewer than MIN_RUNNINGS
    prior runnings (or the correlation is undefined). `n` counts distinct prior
    race_ids. `tier` is one of "sticky" / "average" / "high_overtaking".
    """
    prior = podium_features[
        (podium_features["gp"] == gp) & (podium_features["year"] < year)
    ].dropna(subset=["grid_position", "finish_pos"])
    n = int(prior["race_id"].nunique())
    if n < MIN_RUNNINGS:
        return None
    rho = prior["grid_position"].corr(prior["finish_pos"], method="spearman")
    if pd.isna(rho):
        return None
    score = round(float(rho), 2)
    if score >= STICKY_MIN:
        tier = "sticky"
    elif score < HIGH_OVERTAKING_MAX:
        tier = "high_overtaking"
    else:
        tier = "average"
    return {"score": score, "tier": tier, "n": n}


FRONT_ROW_MAX = 3  # a front-row-ish start worth contextualizing

_LINES = {
    "sticky": ("This is one of the hardest circuits to overtake on, so a "
               "front-row start counts for more than usual here."),
    "high_overtaking": ("This circuit sees a lot of passing, so grid position "
                        "holds less than the starting order suggests and "
                        "positions can change."),
}


def grid_context_line(stickiness: dict | None, drivers: list[dict]) -> str | None:
    """One grounded sentence about overtaking difficulty, or None (silent).

    Fires only when the tier is informative (sticky / high_overtaking) AND at least
    one driver starts on the front rows (grid <= FRONT_ROW_MAX). `average` tiers and
    Friday-shaped drivers (no grid) stay silent.
    """
    if not stickiness or stickiness["tier"] not in _LINES:
        return None
    has_front = any(
        isinstance(d.get("factors", {}).get("grid"), (int, float))
        and d["factors"]["grid"] <= FRONT_ROW_MAX
        for d in drivers
    )
    if not has_front:
        return None
    return _LINES[stickiness["tier"]]
