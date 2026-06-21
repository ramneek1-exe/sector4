# api/inference.py
"""Vercel Python serverless function: pure computed-stat lookup (M2 + M4 deg/stint).

The only product code path that the Next server calls for stat lookups. Serves pit_loss
(curated track features) plus tyre_deg / stint_length (from the bundled strategy table).
Stays fastf1-free AND sklearn-free (enforced by tests/test_inference_no_fastf1.py):
`src/inference/__init__.py` is lazy, so importing `lookup_stat` does not pull in
pace/strategy/sklearn even though this fn now reads a parquet. All logic lives in
`lookup_response`; `handler` is HTTP glue.

Regenerate the bundled strategy table with:
  PYTHONPATH=. .venv/bin/python -c "from src.pipeline import build_all; build_all()"
  cp data/strategy_features.parquet api/
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

from src.inference.lookup import lookup_stat  # noqa: E402

# Strategy feature table for tyre_deg / stint_length lookups (pit_loss ignores it).
_STRATEGY = pd.read_parquet(Path(__file__).with_name("strategy_features.parquet"))


def lookup_response(body: dict) -> tuple[int, dict]:
    """Map a request body to (status, json-serializable payload)."""
    stat, gp = body.get("stat"), body.get("gp")
    if not stat or not gp:
        return 400, {"error": "stat and gp are required"}
    try:
        return 200, lookup_stat(stat, gp, table=_STRATEGY)
    except ValueError as exc:
        return 400, {"error": str(exc)}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            status, payload = 400, {"error": "invalid JSON body"}
        else:
            status, payload = lookup_response(body)
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
