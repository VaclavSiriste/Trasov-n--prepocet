#!/usr/bin/env python3
"""Přepočítá monter_c_* / hodin z ucastnici v DB (bez volání Raynet API).

Použití po opravě seznamu montérů:
  python scripts/reenrich_montaze.py
"""

from __future__ import annotations

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

import psycopg2
from psycopg2.extras import RealDictCursor

from raynet_derive import enrich_montaze_row


def main() -> int:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("CHYBA: chybí DATABASE_URL", flush=True)
        return 1

    conn = psycopg2.connect(dsn, cursor_factory=RealDictCursor)
    updated = 0
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, kategorie, trvani, ucastnici, hodin, pocet_monterohodin,
                          monteri, monter_c_1, monter_c_2, monter_c_3, monteru
                   FROM raynet_montaze
                   ORDER BY id"""
            )
            rows = cur.fetchall()
            print(f"Načteno {len(rows)} řádků raynet_montaze…", flush=True)
            for row in rows:
                before = (
                    row.get("monter_c_1"),
                    row.get("monter_c_2"),
                    row.get("monter_c_3"),
                    row.get("hodin"),
                    row.get("pocet_monterohodin"),
                )
                enriched = enrich_montaze_row(dict(row))
                after = (
                    enriched.get("monter_c_1"),
                    enriched.get("monter_c_2"),
                    enriched.get("monter_c_3"),
                    enriched.get("hodin"),
                    enriched.get("pocet_monterohodin"),
                )
                if before == after:
                    continue
                cur.execute(
                    """UPDATE raynet_montaze SET
                         monteri = %s,
                         monter_c_1 = %s,
                         monter_c_2 = %s,
                         monter_c_3 = %s,
                         monteru = %s,
                         hodin = %s,
                         pocet_monterohodin = %s
                       WHERE id = %s""",
                    (
                        enriched.get("monteri"),
                        enriched.get("monter_c_1"),
                        enriched.get("monter_c_2"),
                        enriched.get("monter_c_3"),
                        enriched.get("monteru"),
                        enriched.get("hodin"),
                        enriched.get("pocet_monterohodin"),
                        row["id"],
                    ),
                )
                updated += 1
        conn.commit()
        print(f"Hotovo: upraveno {updated} řádků.", flush=True)
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"CHYBA: {exc}", flush=True)
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
