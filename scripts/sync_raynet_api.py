#!/usr/bin/env python3
"""
Synchronizace Raynet API -> PostgreSQL.

Použití:
  cp .env.example .env   # doplňte API klíče a DATABASE_URL
  pip install -r requirements.txt
  python scripts/sync_raynet_api.py
  python scripts/sync_raynet_api.py --only prejezdy
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))
sys.path.insert(0, str(ROOT.parent / ".pylibs"))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

try:
    import psycopg2
except ImportError:
    psycopg2 = None

from raynet_sync import run_sync


def main() -> None:
    if psycopg2 is None:
        sys.exit("Nainstalujte závislosti: pip install -r requirements.txt")

    parser = argparse.ArgumentParser(description="Raynet API -> PostgreSQL")
    parser.add_argument(
        "--only",
        choices=["main", "prejezdy", "all"],
        default="all",
        help="Co synchronizovat (default: all)",
    )
    args = parser.parse_args()

    dsn = os.environ.get("DATABASE_URL", "postgresql://trasovani@127.0.0.1:5435/trasovani")
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    try:
        print("Stahuji data z Raynet API…")
        result = run_sync(conn, only=args.only)
        conn.commit()
        for table, count in result["counts"].items():
            print(f"  {table}: {count} řádků")
        print("Hotovo.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
