"""Výpočty měsíčních záložek (Červen 2026) z raynet_montaze – replikace Excelu."""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any

from raynet_derive import sql_monter_hours_filter


def normalize_name(name: str | None) -> str:
    return (name or "").strip().lower()


def parse_mesic_key(mesic_key: str) -> tuple[int, int]:
    parts = mesic_key.split("-")
    return int(parts[0]), int(parts[1])


def month_bounds(rok: int, mesic: int) -> tuple[date, date]:
    last_day = monthrange(rok, mesic)[1]
    return date(rok, mesic, 1), date(rok, mesic, last_day)


def fetch_daily_rows(cur, rok: int, mesic: int) -> list[dict]:
    """Sloupce A/B/I/J – denní souhrn z Raynet MONTÁŽE."""
    cur.execute(
        f"""
        SELECT
          naplanovano_od_datum AS datum,
          COALESCE(SUM(pocet_monterohodin), 0) AS monter_hours,
          COUNT(*) AS montage_count,
          COUNT(DISTINCT NULLIF(LOWER(TRIM(monter_c_1)), '')) AS uniq_monteri
        FROM raynet_montaze
        WHERE rok = %s
          AND mesic = %s
          AND naplanovano_od_datum IS NOT NULL
          AND {sql_monter_hours_filter()}
        GROUP BY naplanovano_od_datum
        ORDER BY naplanovano_od_datum
        """,
        (rok, mesic),
    )
    rows = []
    for r in cur.fetchall():
        montage_count = int(r["montage_count"] or 0)
        uniq = int(r["uniq_monteri"] or 0) or 1
        avg = round(montage_count / uniq, 4) if montage_count else 0
        rows.append({
            "datum": r["datum"].isoformat() if r["datum"] else None,
            "monter_hours": round(float(r["monter_hours"] or 0), 2),
            "montage_count": montage_count,
            "avg_per_day": avg,
        })
    return rows


def fetch_member_monthly_hours(cur, name: str, rok: int, mesic: int) -> float:
    """Součet sloupce M (hodin) pro montéra – řádek P36 v Excelu."""
    norm = normalize_name(name)
    cur.execute(
        f"""
        SELECT COALESCE(SUM(hodin), 0) AS total
        FROM raynet_montaze
        WHERE rok = %s AND mesic = %s
          AND {sql_monter_hours_filter()}
          AND (
            LOWER(TRIM(monter_c_1)) = %s
            OR LOWER(TRIM(monter_c_2)) = %s
            OR LOWER(TRIM(monter_c_3)) = %s
          )
        """,
        (rok, mesic, norm, norm, norm),
    )
    row = cur.fetchone()
    return round(float(row["total"] or 0), 2) if row else 0.0


def fetch_member_daily_hours(cur, name: str, rok: int, mesic: int) -> dict[str, float]:
    """Hodiny odmontováno po dnech – buňky P4, T4, … v Excelu."""
    norm = normalize_name(name)
    cur.execute(
        f"""
        SELECT naplanovano_od_datum AS datum, COALESCE(SUM(hodin), 0) AS hours
        FROM raynet_montaze
        WHERE rok = %s AND mesic = %s
          AND {sql_monter_hours_filter()}
          AND (
            LOWER(TRIM(monter_c_1)) = %s
            OR LOWER(TRIM(monter_c_2)) = %s
            OR LOWER(TRIM(monter_c_3)) = %s
          )
          AND naplanovano_od_datum IS NOT NULL
        GROUP BY naplanovano_od_datum
        """,
        (rok, mesic, norm, norm, norm),
    )
    out: dict[str, float] = {}
    for r in cur.fetchall():
        if r["datum"]:
            h = float(r["hours"] or 0)
            if h > 0:
                out[r["datum"].isoformat()] = round(h, 2)
    return out


def fetch_active_monteri(cur, rok: int, mesic: int) -> list[str]:
    """Montéři s hodinami v měsíci – seřazeno dle součtu hodin."""
    cur.execute(
        f"""
        SELECT monter_c_1 AS name, COALESCE(SUM(hodin), 0) AS total
        FROM raynet_montaze
        WHERE rok = %s AND mesic = %s
          AND {sql_monter_hours_filter()}
          AND monter_c_1 IS NOT NULL AND TRIM(monter_c_1) <> ''
        GROUP BY monter_c_1
        HAVING COALESCE(SUM(hodin), 0) > 0
        ORDER BY total DESC
        """,
        (rok, mesic),
    )
    return [r["name"] for r in cur.fetchall() if r.get("name")]


def fetch_daily_roster(cur, mesic_key: str) -> list[dict]:
    cur.execute(
        """SELECT col_index, jmeno, datum, target_flag, destination_region
           FROM mesicni_rozpis_den WHERE mesic_key = %s ORDER BY datum, col_index""",
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


def fetch_zapis_den(cur, mesic_key: str) -> list[dict]:
    cur.execute(
        """SELECT datum, collected, reason FROM mesicni_zapis_den
           WHERE mesic_key = %s ORDER BY datum""",
        (mesic_key,),
    )
    return [
        {
            "datum": r["datum"].isoformat() if r["datum"] else None,
            "collected": float(r["collected"] or 0),
            "reason": r["reason"] or "",
        }
        for r in cur.fetchall()
    ]


def save_zapis_den(cur, mesic_key: str, rows: list[dict]) -> int:
    cur.execute("DELETE FROM mesicni_zapis_den WHERE mesic_key = %s", (mesic_key,))
    saved = 0
    for row in rows:
        day = row.get("datum")
        if isinstance(day, str):
            day = date.fromisoformat(day[:10])
        if not day:
            continue
        cur.execute(
            """INSERT INTO mesicni_zapis_den (mesic_key, datum, collected, reason)
               VALUES (%s, %s, %s, %s)""",
            (mesic_key, day, float(row.get("collected") or 0), str(row.get("reason") or "")),
        )
        saved += 1
    return saved


def build_mesic_data(cur, mesic_key: str, member_names: list[str] | None = None) -> dict[str, Any]:
    rok, mesic = parse_mesic_key(mesic_key)
    od, do = month_bounds(rok, mesic)

    denni = fetch_daily_rows(cur, rok, mesic)

    names = [n for n in (member_names or []) if n and str(n).strip()]
    if not names:
        names = fetch_active_monteri(cur, rok, mesic)

    members_out = []
    if names:
        for name in names:
            total = fetch_member_monthly_hours(cur, name, rok, mesic)
            daily = fetch_member_daily_hours(cur, name, rok, mesic)
            members_out.append({
                "name": name,
                "mounted_hours": total,
                "actual_flag": 1 if total > 0 else 0,
                "daily_hours": daily,
            })

    daily_roster = fetch_daily_roster(cur, mesic_key)
    zapis_den = fetch_zapis_den(cur, mesic_key)

    return {
        "mesic_key": mesic_key,
        "rok": rok,
        "mesic": mesic,
        "od": od.isoformat(),
        "do": do.isoformat(),
        "denni": denni,
        "members": members_out,
        "daily_roster": daily_roster,
        "zapis_den": zapis_den,
        "source": "postgresql",
    }
