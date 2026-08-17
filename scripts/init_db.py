#!/usr/bin/env python3
"""Aplikuje SQL migrace při startu (Railway / prázdná DB). Idempotentní."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:
    pass

import psycopg2

SQL_DIR = ROOT / "sql"

MIGRATIONS = [
    "schema.sql",
    "schema_prehled.sql",
    "migrate_prehled_v2.sql",
    "migrate_obdobi_skupiny.sql",
    "migrate_nove_lokality.sql",
    "migrate_prejezdy_predmet_text.sql",
    "migrate_mesicni_rozpis_den.sql",
    "migrate_mesicni_zapis_den.sql",
    "migrate_rozpis_col_index.sql",
    "migrate_koef_pouze_zname.sql",
    "migrate_celkem_zakazek.sql",
    "migrate_tym_monteru.sql",
    "migrate_mesic_roster_sort.sql",
    "migrate_mesic_roster_config.sql",
]


def normalize_dsn(dsn: str) -> str:
    if dsn.startswith("postgres://"):
        dsn = "postgresql://" + dsn[len("postgres://") :]
    return dsn


def get_dsn() -> str:
    dsn = os.environ.get("DATABASE_URL", "postgresql://trasovani@127.0.0.1:5435/trasovani")
    return normalize_dsn(dsn)


def apply_migrations() -> None:
    conn = psycopg2.connect(get_dsn())
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    for name in MIGRATIONS:
        path = SQL_DIR / name
        if not path.is_file():
            print(f"init_db: přeskočeno (chybí soubor): {name}")
            continue
        cur.execute("SELECT 1 FROM schema_migrations WHERE filename = %s", (name,))
        if cur.fetchone():
            continue
        print(f"init_db: aplikuji {name}")
        sql = path.read_text(encoding="utf-8")
        cur.execute(sql)
        cur.execute(
            "INSERT INTO schema_migrations (filename) VALUES (%s) ON CONFLICT DO NOTHING",
            (name,),
        )

    cur.close()
    conn.close()
    print("init_db: hotovo")


if __name__ == "__main__":
    apply_migrations()
