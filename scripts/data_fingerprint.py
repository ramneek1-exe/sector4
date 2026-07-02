"""Stable, order-independent content fingerprints for the bundled api/ parquet tables.

Parquet is not byte-deterministic, so a raw `git diff` on api/*.parquet is always dirty and
R17 would deploy every run. This fingerprint hashes each table's VALUES (canonicalized: sorted
columns, sorted rows) so R17 can commit/deploy only when content actually changed.

Run: PYTHONPATH=. python scripts/data_fingerprint.py   # writes api/data-fingerprint.json
"""
from __future__ import annotations

import glob
import hashlib
import json
import os

import pandas as pd

API_DIR = "api"
OUT = os.path.join(API_DIR, "data-fingerprint.json")


def fingerprint_table(df: pd.DataFrame) -> str:
    """sha256 of a table's values, independent of row/column order.

    Assumes a single physical type per column (true for Arrow-backed parquet); a mixed-type
    object column could raise in the row sort.
    """
    canon = df.reindex(sorted(df.columns), axis=1)
    canon = canon.sort_values(list(canon.columns)).reset_index(drop=True)
    return hashlib.sha256(canon.to_csv(index=False).encode("utf-8")).hexdigest()


def compute_fingerprints(api_dir: str = API_DIR) -> dict[str, str]:
    """Fingerprint every parquet table in `api_dir`, keyed by filename."""
    out: dict[str, str] = {}
    for path in sorted(glob.glob(os.path.join(api_dir, "*.parquet"))):
        out[os.path.basename(path)] = fingerprint_table(pd.read_parquet(path))
    return out


def main() -> None:
    fps = compute_fingerprints()
    with open(OUT, "w") as f:
        json.dump(fps, f, indent=2, sort_keys=True)
        f.write("\n")
    print(f"wrote {OUT} ({len(fps)} tables)")


if __name__ == "__main__":
    main()
