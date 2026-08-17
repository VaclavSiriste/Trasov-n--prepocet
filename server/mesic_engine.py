"""Výpočty měsíčních záložek (Červen 2026) z raynet_montaze – replikace Excelu."""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime
from typing import Any

from raynet_derive import sql_monter_hours_filter


def normalize_name(name: str | None) -> str:
    return (name or "").strip().lower()


def as_iso_date(value) -> str | None:
    """Jednotný klíč data YYYY-MM-DD (i když driver vrátí datetime)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    return text[:10] if text else None


def parse_mesic_key(mesic_key: str) -> tuple[int, int]:
    parts = mesic_key.split("-")
    return int(parts[0]), int(parts[1])


def month_bounds(rok: int, mesic: int) -> tuple[date, date]:
    last_day = monthrange(rok, mesic)[1]
    return date(rok, mesic, 1), date(rok, mesic, last_day)


def fetch_daily_rows(cur, rok: int, mesic: int, names: list[str] | None = None) -> list[dict]:
    """Sloupce A/B/I/J – denní souhrn z Raynet MONTÁŽE."""
    extra_sql = ""
    params: list[Any] = [rok, mesic]
    if names is not None:
        norms = [normalize_name(n) for n in names if n and str(n).strip()]
        if not norms:
            return []
        extra_sql = """
          AND (
            LOWER(TRIM(monter_c_1)) = ANY(%s)
            OR LOWER(TRIM(monter_c_2)) = ANY(%s)
            OR LOWER(TRIM(monter_c_3)) = ANY(%s)
          )
        """
        params.extend([norms, norms, norms])
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
          {extra_sql}
        GROUP BY naplanovano_od_datum
        ORDER BY naplanovano_od_datum
        """,
        params,
    )
    rows = []
    for r in cur.fetchall():
        montage_count = int(r["montage_count"] or 0)
        uniq = int(r["uniq_monteri"] or 0) or 1
        avg = round(montage_count / uniq, 4) if montage_count else 0
        rows.append({
            "datum": as_iso_date(r["datum"]),
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
        key = as_iso_date(r["datum"])
        if not key:
            continue
        h = float(r["hours"] or 0)
        if h > 0:
            out[key] = round(h, 2)
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


def is_roster_configured(cur, mesic_key: str) -> bool:
    cur.execute(
        "SELECT configured FROM mesicni_roster_config WHERE mesic_key = %s",
        (mesic_key,),
    )
    row = cur.fetchone()
    if row is not None:
        return bool(row.get("configured"))
    return bool(fetch_mesic_roster(cur, mesic_key))


def set_roster_configured(cur, mesic_key: str, configured: bool = True) -> None:
    cur.execute(
        """INSERT INTO mesicni_roster_config (mesic_key, configured, updated_at)
           VALUES (%s, %s, NOW())
           ON CONFLICT (mesic_key) DO UPDATE SET
             configured = EXCLUDED.configured,
             updated_at = NOW()""",
        (mesic_key, configured),
    )


def fetch_mesic_roster(cur, mesic_key: str) -> list[dict]:
    """Uložený seznam montérů pro měsíc (pořadí sloupců v mřížce)."""
    cur.execute(
        """SELECT jmeno, target_flag, destination_region, sort_order
           FROM mesicni_rozpis_montazu
           WHERE mesic_key = %s
           ORDER BY sort_order, id""",
        (mesic_key,),
    )
    return [
        {
            "jmeno": r["jmeno"],
            "target_flag": int(r["target_flag"] or 0),
            "destination_region": r["destination_region"] or "",
            "sort_order": int(r["sort_order"] or 0),
        }
        for r in cur.fetchall()
    ]


def save_mesic_roster(cur, mesic_key: str, names: list[str]) -> int:
    """Nahradí seznam montérů pro daný měsíc (jen jména + pořadí)."""
    set_roster_configured(cur, mesic_key, True)
    cur.execute("DELETE FROM mesicni_rozpis_montazu WHERE mesic_key = %s", (mesic_key,))
    saved = 0
    kept: list[str] = []
    for idx, raw in enumerate(names or []):
        name = str(raw or "").strip()
        if not name:
            continue
        cur.execute(
            """INSERT INTO mesicni_rozpis_montazu
               (mesic_key, jmeno, target_flag, destination_region, sort_order)
               VALUES (%s, %s, 0, '', %s)""",
            (mesic_key, name, idx + 1),
        )
        kept.append(name)
        saved += 1
    norms = [normalize_name(n) for n in kept]
    if norms:
        cur.execute(
            """DELETE FROM mesicni_rozpis_den
               WHERE mesic_key = %s AND LOWER(TRIM(jmeno)) <> ALL(%s)""",
            (mesic_key, norms),
        )
    else:
        cur.execute("DELETE FROM mesicni_rozpis_den WHERE mesic_key = %s", (mesic_key,))
    return saved


def fetch_roster_member_names(cur, mesic_key: str) -> list[str]:
    """Pořadí montérů – primárně uložený měsíční seznam."""
    if is_roster_configured(cur, mesic_key):
        return [r["jmeno"] for r in fetch_mesic_roster(cur, mesic_key)]

    roster = fetch_mesic_roster(cur, mesic_key)
    if roster:
        return [r["jmeno"] for r in roster]

    names: list[str] = []
    seen: set[str] = set()

    def add(name: str | None) -> None:
        trimmed = str(name or "").strip()
        key = normalize_name(trimmed)
        if not key or key in seen:
            return
        seen.add(key)
        names.append(trimmed)

    cur.execute(
        """SELECT jmeno, MIN(col_index) AS col_index
           FROM mesicni_rozpis_den
           WHERE mesic_key = %s AND jmeno IS NOT NULL AND TRIM(jmeno) <> ''
           GROUP BY jmeno
           ORDER BY MIN(col_index), jmeno""",
        (mesic_key,),
    )
    for row in cur.fetchall():
        add(row.get("jmeno"))

    return names


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

    requested = [n for n in (member_names or []) if n and str(n).strip()]
    from_db = fetch_roster_member_names(cur, mesic_key)
    roster_locked = is_roster_configured(cur, mesic_key)
    names: list[str] = []
    seen: set[str] = set()

    def add_name(name: str | None) -> None:
        trimmed = str(name or "").strip()
        key = normalize_name(trimmed)
        if not key or key in seen:
            return
        seen.add(key)
        names.append(trimmed)

    if roster_locked:
        for name in from_db:
            add_name(name)
    else:
        active = fetch_active_monteri(cur, rok, mesic)
        for name in from_db + active + requested:
            add_name(name)

    denni = fetch_daily_rows(cur, rok, mesic, names if roster_locked else None)

    members_out = []
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
    roster = fetch_mesic_roster(cur, mesic_key)

    return {
        "mesic_key": mesic_key,
        "rok": rok,
        "mesic": mesic,
        "od": od.isoformat(),
        "do": do.isoformat(),
        "denni": denni,
        "members": members_out,
        "roster": roster,
        "daily_roster": daily_roster,
        "zapis_den": zapis_den,
        "roster_configured": roster_locked,
        "source": "postgresql",
    }
