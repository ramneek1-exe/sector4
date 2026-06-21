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

from src.inference.strategy import predict_stop_counts  # noqa: E402
from src.inference.teams import attach_teams  # noqa: E402

_TABLE = pd.read_parquet(Path(__file__).with_name("strategy_features.parquet"))
_TEAMS = pd.read_parquet(Path(__file__).with_name("team_map.parquet"))


def strategy_response(body: dict) -> tuple[int, dict]:
    """Map a request body {year, gp} to (status, json-serializable payload)."""
    year, gp = body.get("year"), body.get("gp")
    if year is None or not gp:
        return 400, {"error": "year and gp are required"}
    try:
        year = int(year)
    except (TypeError, ValueError):
        return 400, {"error": "year must be an integer"}
    payload = predict_stop_counts(year, gp, table=_TABLE)
    payload["drivers"] = attach_teams(payload["drivers"], _TEAMS, year, gp)
    return 200, payload


class handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            status, payload = 400, {"error": "invalid JSON body"}
        else:
            status, payload = strategy_response(body)
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
