# api/podium.py
"""Vercel Python serverless function: live podium-probability inference (M3).

Per-request inference (not a precompute lookup): calls src.inference.predict_podium
on the bundled feature table. Separate from api/inference.py so the lookup path
stays slim; this function carries scikit-learn (still well under Vercel's 500MB
limit once the batch-only deps — fastf1/matplotlib — are excluded). All logic lives
in `podium_response`; `handler` is HTTP glue.

The 17KB feature table ships alongside this file (api/podium_features.parquet) and
is read once at cold start, then passed explicitly to predict_podium so the call
never depends on a CWD-relative store path. Regenerate it with
`PYTHONPATH=. .venv/bin/python notebooks/07_podium.py` then
`cp data/podium_features.parquet api/podium_features.parquet`.
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import pandas as pd

# Make `src` importable when Vercel runs this file as a standalone script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.calendar import GP_TO_EVENT, race_id  # noqa: E402
from src.inference.podium import predict_podium  # noqa: E402
from src.inference.upcoming import predict_upcoming_podium  # noqa: E402

_TABLE = pd.read_parquet(Path(__file__).with_name("podium_features.parquet"))
_SEASON = pd.read_parquet(Path(__file__).with_name("season_results.parquet"))
_PACE = pd.read_parquet(Path(__file__).with_name("pace_features.parquet"))
_RACE_IDS = set(_TABLE["race_id"])


def podium_response(body: dict) -> tuple[int, dict]:
    """Map a request body {year, gp, mode?, grid?} to (status, json payload).

    Historical weekends (a row exists in the bundled table) predict directly. An
    UPCOMING weekend (no row — e.g. the live 2026 target) has its feature row built
    at runtime from season results + prior-year pace; `grid` (a {driver: position}
    map, present only after qualifying) sharpens Friday -> Saturday.
    """
    year, gp = body.get("year"), body.get("gp")
    if year is None or not gp:
        return 400, {"error": "year and gp are required"}
    try:
        year = int(year)
    except (TypeError, ValueError):
        return 400, {"error": "year must be an integer"}
    mode = body.get("mode", "auto")
    if race_id(year, gp) in _RACE_IDS:
        return 200, predict_podium(year, gp, mode=mode, table=_TABLE)
    if gp in GP_TO_EVENT:
        # Known circuit with no table row -> an upcoming weekend: build the row at
        # runtime. `grid` ({driver: position}) is known only after qualifying.
        grid = body.get("grid")
        return 200, predict_upcoming_podium(_TABLE, _SEASON, _PACE, year, gp,
                                            grid=grid, mode=mode)
    # Unknown circuit: honest empty qualitative band (never a constructed guess).
    return 200, predict_podium(year, gp, mode=mode, table=_TABLE)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            status, payload = 400, {"error": "invalid JSON body"}
        else:
            status, payload = podium_response(body)
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
