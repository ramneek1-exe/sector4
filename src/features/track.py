"""Track-intrinsic features (spike Step 4, PRD §7.2).

These are circuit-stable constants that transfer across regulation eras (unlike
car/deg features), so they serve as priors and as circuit identity in the
cross-year design. Values are curated public circuit facts (lap length, corner
count) plus coarse proxies (abrasiveness 1-5, typical pit-lane time loss in s).

Spike-grade: curated, not derived. The production model (PRD §7.2) should derive
pit-loss from data and verify abrasiveness against Pirelli's own track guides.
Keyed by the GP identifier passed to fastf1 `get_session`.
"""
from __future__ import annotations

TRACK_FEATURE_COLS = ["length_km", "n_corners", "abrasiveness", "pit_loss_s"]

_TRACKS: dict[str, dict[str, float]] = {
    # high-deg, abrasive, hot
    "Bahrain": {"length_km": 5.412, "n_corners": 15, "abrasiveness": 5, "pit_loss_s": 23.0},
    # high-deg, high-energy corners
    "Spain": {"length_km": 4.657, "n_corners": 14, "abrasiveness": 4, "pit_loss_s": 21.0},
    # high-downforce, medium-deg, hot
    "Hungary": {"length_km": 4.381, "n_corners": 14, "abrasiveness": 3, "pit_loss_s": 20.0},
    # low-downforce, low-deg, long lap
    "Italy": {"length_km": 5.793, "n_corners": 11, "abrasiveness": 2, "pit_loss_s": 22.0},
    # low/medium-deg, night race
    "Abu Dhabi": {"length_km": 5.281, "n_corners": 16, "abrasiveness": 2, "pit_loss_s": 20.0},
    # high-speed, high-overtaking, low-deg (added for circuit-mix balance)
    "Saudi Arabia": {"length_km": 6.174, "n_corners": 27, "abrasiveness": 2, "pit_loss_s": 20.0},
    # altitude, medium-high overtaking, low-deg
    "Mexico City": {"length_km": 4.304, "n_corners": 17, "abrasiveness": 2, "pit_loss_s": 22.0},
    # long straights, high overtaking, low-deg, cold night
    "Las Vegas": {"length_km": 6.201, "n_corners": 17, "abrasiveness": 1, "pit_loss_s": 20.0},
    # street circuit, short pit lane offset by the reduced 60 kph pit limit
    "Monaco": {"length_km": 3.337, "n_corners": 19, "abrasiveness": 2, "pit_loss_s": 19.5},
}

# Neutral fallback so an unseen circuit degrades gracefully instead of crashing.
_DEFAULTS = {"length_km": 5.0, "n_corners": 15, "abrasiveness": 3, "pit_loss_s": 21.0}


def track_features(gp_key: str) -> dict[str, float]:
    """Return the track-intrinsic feature dict for a GP identifier."""
    return dict(_TRACKS.get(gp_key, _DEFAULTS))
