# api/strategy.py
"""Vercel Python serverless function: live stop-count strategy inference (M4, Model B).

The validated telemetry edge (+0.07 vs track-norm) and the deg->stops explainer hook.
Per-request inference over the bundled strategy table; team attached for the glyphs. The
SC caveat is always present in the payload. Carries scikit-learn; under Vercel's 500MB
limit. Logic lives in `strategy_response`; `handler` is HTTP glue.

Regenerate the bundled tables with:
  PYTHONPATH=. .venv/bin/python -c "from src.pipeline import build_all; build_all()"
  cp data/strategy_features.parquet api/ && cp data/team_map.parquet api/
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.inference.stops import actual_stops, historical_stop_norm  # noqa: E402
from src.inference.strategy import predict_stop_counts, dominant_compound_norm  # noqa: E402
from src.inference.teams import attach_teams  # noqa: E402

_TABLE = pd.read_parquet(Path(__file__).with_name("strategy_features.parquet"))
_TEAMS = pd.read_parquet(Path(__file__).with_name("team_map.parquet"))
_ACTUAL = pd.read_parquet(Path(__file__).with_name("actual_stops.parquet"))


def strategy_response(body: dict) -> tuple[int, dict]:
    """Route a stops question by race state: completed -> actual, upcoming+dry-FP -> Model-B
    prediction, otherwise -> historical norm. All return a `mode`-tagged StrategyFacts shape."""
    year, gp = body.get("year"), body.get("gp")
    if year is None or not gp:
        return 400, {"error": "year and gp are required"}
    try:
        year = int(year)
    except (TypeError, ValueError):
        return 400, {"error": "year must be an integer"}

    act = actual_stops(year, gp, _ACTUAL)
    if act is not None:
        share = round(act["n_at_modal"] / act["n_drivers"], 2) if act["n_drivers"] else None
        return 200, {
            "year": year, "gp": gp, "mode": "actual", "qualitative": False, "sc_caveat": "",
            "dominant": {"n_stops": act["modal_stops"], "share": share,
                         "n_drivers": act["n_drivers"]},
            "stops_min": act["stops_min"], "stops_max": act["stops_max"], "drivers": [],
        }

    pred = predict_stop_counts(year, gp, table=_TABLE)
    if pred.get("dominant"):
        pred["mode"] = "predicted"
        pred["drivers"] = attach_teams(pred["drivers"], _TEAMS, year, gp)
        return 200, pred

    norm = historical_stop_norm(gp, _ACTUAL, before_year=year)
    if norm is not None:
        return 200, {
            "year": year, "gp": gp, "mode": "historical", "qualitative": False, "sc_caveat": "",
            "dominant": {"n_stops": norm["modal_stops"], "share": None, "n_drivers": None},
            "n_seasons": norm["n_seasons"], "drivers": [],
        }

    # No actuals, no FP row, no history: honest low-data state (keep predict_stop_counts' shape).
    pred["mode"] = "historical"
    pred["sc_caveat"] = ""
    return 200, pred


def compound_response(body: dict) -> tuple[int, dict]:
    """Historical 'typical compound here' (no telemetry edge; a NORM, not a prediction)."""
    year, gp = body.get("year"), body.get("gp")
    if year is None or not gp:
        return 400, {"error": "year and gp are required"}
    try:
        year = int(year)
    except (TypeError, ValueError):
        return 400, {"error": "year must be an integer"}
    return 200, dominant_compound_norm(year, gp, table=_TABLE)


def route(body: dict) -> tuple[int, dict]:
    """Dispatch by `kind`: compound norm vs the default stop-count response."""
    if body.get("kind") == "compound":
        return compound_response(body)
    return strategy_response(body)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            status, payload = 400, {"error": "invalid JSON body"}
        else:
            status, payload = route(body)
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
