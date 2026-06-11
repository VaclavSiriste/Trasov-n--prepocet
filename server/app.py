#!/usr/bin/env python3
"""API server pro trasovani-reporting (PostgreSQL + výpočty Přehled MONTÁŽE)."""

from __future__ import annotations

import json
import os
import sys
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))
_pylibs = ROOT.parent / ".pylibs"
if _pylibs.is_dir():
    sys.path.insert(0, str(_pylibs))

def _load_env() -> None:
    env_file = ROOT / ".env"
    try:
        from dotenv import load_dotenv
        load_dotenv(env_file, override=True)
    except ImportError:
        pass
    if env_file.is_file():
        auth_enabled_in_file = any(
            line.strip().startswith("AUTH_DISABLED=") and not line.strip().startswith("#")
            for line in env_file.read_text(encoding="utf-8").splitlines()
        )
        if not auth_enabled_in_file:
            os.environ.pop("AUTH_DISABLED", None)


_load_env()

import psycopg2
from psycopg2.extras import RealDictCursor

from auth_handlers import handle_auth_get, handle_auth_post, require_auth
from mesic_engine import build_mesic_data, save_zapis_den
from prehled_engine import (
    KRAJE_LIST,
    compute_overview,
    derive_daily_roster_from_raynet,
    merge_daily_rosters,
    parse_date,
    roster_from_daily,
)
from raynet_sync import run_sync


DEFAULT_DSN = "postgresql://trasovani@127.0.0.1:5435/trasovani"

STATIC_MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}


def normalize_dsn(dsn: str) -> str:
    if dsn.startswith("postgres://"):
        dsn = "postgresql://" + dsn[len("postgres://") :]
    return dsn


def get_conn():
    dsn = normalize_dsn(os.environ.get("DATABASE_URL", DEFAULT_DSN))
    return psycopg2.connect(dsn, cursor_factory=RealDictCursor)


def serve_static(handler, path: str) -> bool:
    """Statické soubory frontendu (Railway – jeden port)."""
    if path == "/":
        rel = "index.html"
    else:
        rel = path.lstrip("/")
    if not rel or ".." in rel or rel.startswith("/"):
        return False
    file_path = (ROOT / rel).resolve()
    if not str(file_path).startswith(str(ROOT.resolve())):
        return False
    if not file_path.is_file():
        return False
    data = file_path.read_bytes()
    mime = STATIC_MIME.get(file_path.suffix.lower(), "application/octet-stream")
    handler.send_response(200)
    handler.send_header("Content-Type", mime)
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-cache")
    handler.end_headers()
    handler.wfile.write(data)
    return True


def json_response(handler, code, payload):
    body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler):
    length = int(handler.headers.get("Content-Length", 0))
    if not length:
        return {}
    return json.loads(handler.rfile.read(length).decode("utf-8"))


def fetch_podklady(cur):
    cur.execute("SELECT lokalita, fond, koeficient FROM podklady_lokality ORDER BY lokalita")
    return cur.fetchall()


def fetch_obdobi(cur, ciselnik_id=None):
    sql = """SELECT id, ciselnik_id, od, "do", skupina, lokalita, objednano_ks, posunout_vyrobu, sort_order
             FROM prehled_obdobi WHERE 1=1"""
    params = []
    if ciselnik_id:
        sql += " AND ciselnik_id = %s"
        params.append(ciselnik_id)
    sql += " ORDER BY sort_order, id"
    cur.execute(sql, params)
    return cur.fetchall()


def fetch_ciselnik(cur):
    cur.execute(
        """SELECT id, nazev, od, "do", aktivni, sort_order FROM ciselnik_obdobi
           WHERE aktivni = TRUE ORDER BY sort_order, id"""
    )
    return cur.fetchall()


def fetch_nastaveni(cur):
    cur.execute("SELECT nastaveny_mesic, nastaveny_rok FROM prehled_nastaveni WHERE id = 1")
    row = cur.fetchone()
    return row or {"nastaveny_mesic": 6, "nastaveny_rok": 2026}


def fetch_koeficienty(cur, rok: int):
    cur.execute(
        "SELECT kraj, rok, mesic, koeficient FROM koeficienty_kraje WHERE rok = %s ORDER BY kraj, mesic",
        (rok,),
    )
    return cur.fetchall()


def fetch_lokalita_kraje(cur):
    cur.execute("SELECT lokalita, kraj FROM lokalita_kraje ORDER BY lokalita, kraj")
    return cur.fetchall()


def fetch_roster(cur, mesic_key: str, fallback: list):
    cur.execute(
        """SELECT jmeno, target_flag, destination_region
           FROM mesicni_rozpis_montazu WHERE mesic_key = %s""",
        (mesic_key,),
    )
    rows = cur.fetchall()
    if rows:
        return [
            {
                "jmeno": r["jmeno"],
                "target_flag": r["target_flag"],
                "destination_region": r["destination_region"],
            }
            for r in rows
        ]
    return fallback


def fetch_daily_roster(cur, mesic_key: str) -> list[dict]:
    cur.execute(
        """SELECT col_index, jmeno, datum, target_flag, destination_region
           FROM mesicni_rozpis_den
           WHERE mesic_key = %s
           ORDER BY datum, col_index""",
        (mesic_key,),
    )
    return [
        {
            "col_index": int(r.get("col_index") or 0),
            "jmeno": r["jmeno"],
            "datum": r["datum"].isoformat() if r["datum"] else None,
            "target_flag": int(r["target_flag"] or 0),
            "destination_region": r["destination_region"],
        }
        for r in cur.fetchall()
    ]


def save_daily_roster(cur, mesic_key: str, entries: list[dict]) -> int:
    if not entries:
        return 0
    cur.execute("DELETE FROM mesicni_rozpis_den WHERE mesic_key = %s", (mesic_key,))
    saved = 0
    for entry in entries:
        day = parse_date(entry.get("datum"))
        name = (entry.get("jmeno") or "").strip()
        if not day or not name:
            continue
        cur.execute(
            """INSERT INTO mesicni_rozpis_den
               (mesic_key, col_index, jmeno, datum, target_flag, destination_region)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                mesic_key,
                int(entry.get("col_index") or 0),
                name,
                day,
                int(entry.get("target_flag") or 0),
                entry.get("destination_region") or "MSK",
            ),
        )
        saved += 1
    return saved


def fetch_raynet(cur, od: date | None, do: date | None):
    sql = """SELECT kategorie, naplanovano_od, naplanovano_do, hodin, pocet_monterohodin,
                    monter_c_1, monter_c_2, monter_c_3, naplanovano_od_datum, kraj
             FROM raynet_montaze WHERE 1=1"""
    params = []
    if od:
        sql += " AND COALESCE(naplanovano_od_datum, naplanovano_od::date) >= %s"
        params.append(od)
    if do:
        sql += " AND COALESCE(naplanovano_od_datum, naplanovano_od::date) <= %s"
        params.append(do)
    cur.execute(sql, params)
    return cur.fetchall()


def build_prehled(cur, body: dict) -> dict:
    mesic_key = body.get("mesic_key", "2026-06")
    roster = body.get("roster") or []
    filter_od = parse_date(body.get("od"))
    filter_do = parse_date(body.get("do"))
    ciselnik_id = body.get("ciselnik_id")

    roster_overlay = fetch_daily_roster(cur, mesic_key)
    if not roster_overlay:
        roster_overlay = body.get("daily_roster") or []

    if roster and not roster_overlay:
        cur.execute("DELETE FROM mesicni_rozpis_montazu WHERE mesic_key = %s", (mesic_key,))
        for m in roster:
            cur.execute(
                """INSERT INTO mesicni_rozpis_montazu (mesic_key, jmeno, target_flag, destination_region)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (mesic_key, jmeno) DO UPDATE SET
                     target_flag = EXCLUDED.target_flag,
                     destination_region = EXCLUDED.destination_region""",
                (mesic_key, m["jmeno"], int(m.get("target_flag") or 0), m["destination_region"]),
            )

    nastaveni = fetch_nastaveni(cur)
    if body.get("nastaveny_mesic") is not None:
        nastaveni["nastaveny_mesic"] = int(body["nastaveny_mesic"])
    if body.get("nastaveny_rok") is not None:
        nastaveni["nastaveny_rok"] = int(body["nastaveny_rok"])

    cur.execute(
        """INSERT INTO prehled_nastaveni (id, nastaveny_mesic, nastaveny_rok)
           VALUES (1, %s, %s)
           ON CONFLICT (id) DO UPDATE SET
             nastaveny_mesic = EXCLUDED.nastaveny_mesic,
             nastaveny_rok = EXCLUDED.nastaveny_rok""",
        (nastaveni["nastaveny_mesic"], nastaveni["nastaveny_rok"]),
    )

    podklady = fetch_podklady(cur)
    obdobi = fetch_obdobi(cur, ciselnik_id)

    raynet_od = filter_od
    raynet_do = filter_do
    if not raynet_od and obdobi:
        raynet_od = min(parse_date(r["od"]) for r in obdobi if parse_date(r["od"]))
    if not raynet_do and obdobi:
        raynet_do = max(parse_date(r["do"]) for r in obdobi if parse_date(r["do"]))

    raynet = fetch_raynet(cur, raynet_od, raynet_do)

    derived_roster = derive_daily_roster_from_raynet(raynet)
    daily_roster = (
        merge_daily_rosters(derived_roster, roster_overlay)
        if roster_overlay
        else derived_roster
    )

    roster_db = fetch_roster(cur, mesic_key, roster)
    if not roster_db and daily_roster:
        roster_db = roster_from_daily(daily_roster)
    rok = int(nastaveni["nastaveny_rok"])
    koef_rows = fetch_koeficienty(cur, rok)
    lok_kraje = fetch_lokalita_kraje(cur)

    if ciselnik_id:
        cur.execute('SELECT od, "do" FROM ciselnik_obdobi WHERE id = %s', (ciselnik_id,))
        ciselnik = cur.fetchone()
        if ciselnik:
            filter_od = filter_od or parse_date(ciselnik["od"])
            filter_do = filter_do or parse_date(ciselnik["do"])

    result = compute_overview(
        obdobi, podklady, roster_db, raynet, filter_od, filter_do,
        nastaveni, koef_rows, lok_kraje, daily_roster or None,
    )
    result["ciselnik_obdobi"] = fetch_ciselnik(cur)
    result["lokalita_kraje"] = lok_kraje
    result["daily_roster_count"] = len(daily_roster or [])
    result["daily_roster_derived_count"] = len(derived_roster or [])
    result["daily_roster_overlay_count"] = len(roster_overlay or [])
    result["raynet_montaze_count"] = len(raynet or [])
    return result


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(fmt % args)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        conn = None
        try:
            if handle_auth_get(self, parsed.path, parsed.query):
                return

            if not require_auth(self, parsed.path):
                return

            if not parsed.path.startswith("/api/"):
                if serve_static(self, parsed.path):
                    return
                self.send_error(404)
                return

            if parsed.path == "/api/health":
                json_response(self, 200, {"ok": True})
                return

            conn = get_conn()
            with conn.cursor() as cur:
                if parsed.path == "/api/ciselnik-obdobi":
                    json_response(self, 200, {"ciselnik": fetch_ciselnik(cur)})
                    return

                if parsed.path == "/api/koeficienty-kraje":
                    rok = int(qs.get("rok", [fetch_nastaveni(cur)["nastaveny_rok"]])[0])
                    json_response(self, 200, {
                        "rok": rok,
                        "kraje": KRAJE_LIST,
                        "rows": fetch_koeficienty(cur, rok),
                        "lokalita_kraje": fetch_lokalita_kraje(cur),
                    })
                    return

                if parsed.path == "/api/prehled-montaze":
                    body = {
                        "mesic_key": qs.get("mesic_key", ["2026-06"])[0],
                        "od": qs.get("od", [None])[0],
                        "do": qs.get("do", [None])[0],
                        "ciselnik_id": int(qs["ciselnik_id"][0]) if qs.get("ciselnik_id") else None,
                        "roster": json.loads(qs["roster"][0]) if "roster" in qs else [],
                    }
                    json_response(self, 200, build_prehled(cur, body))
                    return

                if parsed.path == "/api/mesic-data":
                    mesic_key = qs.get("mesic_key", ["2026-06"])[0]
                    members = json.loads(qs["members"][0]) if qs.get("members") else []
                    json_response(self, 200, build_mesic_data(cur, mesic_key, members))
                    return

            json_response(self, 404, {"error": "Not found"})
        except Exception as exc:
            json_response(self, 500, {"error": str(exc)})
        finally:
            if conn:
                conn.close()

    def do_POST(self):
        parsed = urlparse(self.path)
        conn = None
        try:
            body = read_json(self)
            if handle_auth_post(self, parsed.path, body):
                return
            if not require_auth(self, parsed.path):
                return

            conn = get_conn()
            with conn.cursor() as cur:
                if parsed.path == "/api/prehled-montaze":
                    result = build_prehled(cur, body)
                    conn.commit()
                    json_response(self, 200, result)
                    return

                if parsed.path == "/api/mesic-data":
                    mesic_key = body.get("mesic_key", "2026-06")
                    members = body.get("members") or []
                    json_response(self, 200, build_mesic_data(cur, mesic_key, members))
                    return

                if parsed.path == "/api/mesic-zapis":
                    mesic_key = body.get("mesic_key", "2026-06")
                    daily = body.get("daily_roster") or []
                    zapis = body.get("zapis_den") or []
                    if daily:
                        save_daily_roster(cur, mesic_key, daily)
                    if zapis:
                        save_zapis_den(cur, mesic_key, zapis)
                    conn.commit()
                    json_response(self, 200, {
                        "ok": True,
                        "daily_roster": len(daily),
                        "zapis_den": len(zapis),
                    })
                    return

                if parsed.path == "/api/sync-raynet":
                    only = body.get("only", "all")
                    if only not in ("main", "prejezdy", "all"):
                        json_response(self, 400, {"error": "only musí být main, prejezdy nebo all"})
                        return
                    result = run_sync(conn, only=only)
                    conn.commit()
                    json_response(self, 200, result)
                    return

                if parsed.path == "/api/podklady":
                    for row in body.get("podklady") or []:
                        cur.execute(
                            """INSERT INTO podklady_lokality (lokalita, fond, koeficient)
                               VALUES (%s, %s, %s)
                               ON CONFLICT (lokalita) DO UPDATE SET fond = EXCLUDED.fond""",
                            (row["lokalita"], row["fond"], row.get("koeficient", 1)),
                        )
                    conn.commit()
                    json_response(self, 200, {"ok": True})
                    return

                if parsed.path == "/api/koeficienty-kraje":
                    rok = int(body.get("rok") or 2026)
                    for row in body.get("rows") or []:
                        cur.execute(
                            """INSERT INTO koeficienty_kraje (kraj, rok, mesic, koeficient)
                               VALUES (%s, %s, %s, %s)
                               ON CONFLICT (kraj, rok, mesic) DO UPDATE SET koeficient = EXCLUDED.koeficient""",
                            (row["kraj"], rok, int(row["mesic"]), float(row["koeficient"])),
                        )
                    conn.commit()
                    json_response(self, 200, {"ok": True})
                    return

                if parsed.path == "/api/ciselnik-obdobi":
                    row = body
                    if row.get("id"):
                        cur.execute(
                            """UPDATE ciselnik_obdobi SET nazev=%s, od=%s, "do"=%s, sort_order=%s WHERE id=%s""",
                            (row["nazev"], row["od"], row["do"], row.get("sort_order", 0), row["id"]),
                        )
                    else:
                        cur.execute(
                            """INSERT INTO ciselnik_obdobi (nazev, od, "do", sort_order)
                               VALUES (%s, %s, %s, %s) RETURNING id""",
                            (row["nazev"], row["od"], row["do"], row.get("sort_order", 0)),
                        )
                    conn.commit()
                    json_response(self, 200, {"ok": True})
                    return

                if parsed.path == "/api/prehled-obdobi":
                    row = body
                    if row.get("id"):
                        cur.execute(
                            """UPDATE prehled_obdobi SET od=%s, "do"=%s, skupina=%s, lokalita=%s,
                               objednano_ks=%s, posunout_vyrobu=%s, sort_order=%s, ciselnik_id=%s WHERE id=%s""",
                            (row["od"], row["do"], row.get("skupina"), row["lokalita"],
                             row.get("objednano_ks", 0), row.get("posunout_vyrobu", "NE"),
                             row.get("sort_order", 0), row.get("ciselnik_id"), row["id"]),
                        )
                    else:
                        cur.execute(
                            """INSERT INTO prehled_obdobi (od, "do", skupina, lokalita, objednano_ks,
                               posunout_vyrobu, sort_order, ciselnik_id)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                            (row["od"], row["do"], row.get("skupina"), row["lokalita"],
                             row.get("objednano_ks", 0), row.get("posunout_vyrobu", "NE"),
                             row.get("sort_order", 0), row.get("ciselnik_id")),
                        )
                    conn.commit()
                    json_response(self, 200, {"ok": True})
                    return

                if parsed.path == "/api/obdobi-lokalita":
                    for row in body.get("rows") or []:
                        cur.execute(
                            """UPDATE prehled_obdobi SET od=%s, "do"=%s WHERE lokalita=%s AND id=%s""",
                            (row["od"], row["do"], row["lokalita"], row["id"]),
                        )
                    conn.commit()
                    json_response(self, 200, {"ok": True})
                    return

            json_response(self, 404, {"error": "Not found"})
        except Exception as exc:
            if conn:
                conn.rollback()
            json_response(self, 500, {"error": str(exc)})
        finally:
            if conn:
                conn.close()


def main():
    port = int(os.environ.get("PORT", "8080"))
    host = os.environ.get("HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Server běží na http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
