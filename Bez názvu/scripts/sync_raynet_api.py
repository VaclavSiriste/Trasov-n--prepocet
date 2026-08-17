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
import traceback
from pathlib import Path

# Ať Railway logy ukazují řádky hned (ne až po pádu)
os.environ.setdefault("PYTHONUNBUFFERED", "1")

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


def _looks_like_placeholder(value: str | None) -> bool:
    if not value:
        return True
    v = value.strip().lower()
    return v in ("", "your-prejezdy-api-key-here", "your-api-key-here", "change_me")


def main() -> int:
    if psycopg2 is None:
        print("Nainstalujte závislosti: pip install -r requirements.txt", flush=True)
        return 1

    parser = argparse.ArgumentParser(description="Raynet API -> PostgreSQL")
    parser.add_argument(
        "--only",
        choices=["main", "prejezdy", "all"],
        default="main",
        help="Co synchronizovat (default: main – montáže/zaměřovači)",
    )
    args = parser.parse_args()

    dsn = os.environ.get("DATABASE_URL", "postgresql://trasovani@127.0.0.1:5435/trasovani")
    if dsn.startswith("postgres://"):
        dsn = "postgresql://" + dsn[len("postgres://") :]

    print(f"DATABASE_URL nastaveno: {'ano' if os.environ.get('DATABASE_URL') else 'NE'}", flush=True)
    print(f"RAYNET_USERNAME: {'ano' if os.environ.get('RAYNET_USERNAME') else 'NE'}", flush=True)
    print(f"RAYNET_API_KEY: {'ano' if os.environ.get('RAYNET_API_KEY') else 'NE'}", flush=True)
    print(f"RAYNET_INSTANCE: {os.environ.get('RAYNET_INSTANCE', '(chybí)')}", flush=True)
    print(f"Režim: --only {args.only}", flush=True)

    only = args.only
    if only in ("all", "prejezdy") and _looks_like_placeholder(
        os.environ.get("RAYNET_PREJEZDY_API_KEY")
    ):
        print("VAROVÁNÍ: chybí platný RAYNET_PREJEZDY_API_KEY – synchronizuji jen main", flush=True)
        only = "main"

    try:
        print("Připojuji k databázi…", flush=True)
        conn = psycopg2.connect(dsn)
    except Exception as e:
        print(f"CHYBA připojení k DB: {e}", flush=True)
        traceback.print_exc()
        return 1

    conn.autocommit = False
    try:
        print("Stahuji data z Raynet API…", flush=True)
        result = run_sync(conn, only=only)
        conn.commit()
        for table, count in result["counts"].items():
            print(f"  {table}: {count} řádků", flush=True)
        print("Hotovo.", flush=True)
        return 0
    except Exception as e:
        conn.rollback()
        print(f"CHYBA sync: {e}", flush=True)
        traceback.print_exc()
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
