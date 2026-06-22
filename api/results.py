# api/results.py
"""Vercel Python serverless function: actual finishing order (M5).

Read-only lookup over the bundled season_results table — the actuals source the cron
uses to score issued podium predictions (calibration record). fastf1-free; mirrors
api/podium.py's structure. Logic in `results_response`; `handler` is HTTP glue.

Regenerate the bundled table with scripts/build_2026.py, then
`cp data/season_results.parquet api/season_results.parquet`.
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.calendar import GP_TO_EVENT  # noqa: E402

_RESULTS = pd.read_parquet(Path(__file__).with_name("season_results.parquet"))


def results_response(year, gp: str | None) -> tuple[int, dict]:
    """Map (year, gp) to (status, {year, gp, finishOrder}). Empty for an unrun race."""
    if year is None or not gp:
        return 400, {"error": "year and gp are required"}
    try:
        year = int(year)
    except (TypeError, ValueError):
        return 400, {"error": "year must be an integer"}
    event = GP_TO_EVENT.get(gp, gp)
    rows = _RESULTS[(_RESULTS["year"] == year) & (_RESULTS["gp"] == event)]
    order = rows.sort_values("finish_pos")["Driver"].tolist() if not rows.empty else []
    return 200, {"year": year, "gp": gp, "finishOrder": order}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        q = parse_qs(urlparse(self.path).query)
        year = q.get("year", [None])[0]
        gp = q.get("gp", [None])[0]
        status, payload = results_response(year, gp)
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
