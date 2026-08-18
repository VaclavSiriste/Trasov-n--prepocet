"""Výpočet Přehled MONTÁŽE – replikace logiky z Excelu."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from raynet_derive import counts_as_monter_hours


KRAJE_LIST = [
    "Hlavní město Praha",
    "Jihomoravský kraj",
    "Kraj Vysočina",
    "Královéhradecký kraj",
    "Liberecký kraj",
    "Moravskoslezský kraj",
    "Olomoucký kraj",
    "Pardubický kraj",
    "Plzeňský kraj",
    "Karlovarský kraj",
    "Středočeský kraj",
    "Ústecký kraj",
    "Zlínský kraj",
    "Jihočeský kraj",
]

LOKALITA_KRAJE_DEFAULT: dict[str, list[str]] = {
    "MSK": ["Olomoucký kraj", "Moravskoslezský kraj", "Zlínský kraj"],
    "PR/ST": ["Hlavní město Praha", "Středočeský kraj", "Jihočeský kraj"],
    "BR": ["Jihomoravský kraj", "Kraj Vysočina"],
    "PCE/KH": ["Pardubický kraj", "Královéhradecký kraj"],
    "PL": ["Plzeňský kraj", "Karlovarský kraj"],
    "Ústí": ["Ústecký kraj"],
    "Libr": ["Liberecký kraj"],
    "Zlín": ["Zlínský kraj"],
    "Olomouc": ["Olomoucký kraj"],
    "Vysočina": ["Kraj Vysočina"],
    "České Budějovice": ["Jihočeský kraj"],
}

# Hlavní skupiny z Přehledu – mají přednost před jedno-krajovými lokalitami (Zlín, Olomouc…).
PRIMARY_LOKALITY = ["MSK", "PR/ST", "BR", "PCE/KH", "PL", "Ústí", "Libr"]


def _norm_kraj_token(val: str) -> str:
    return (
        (val or "")
        .strip()
        .lower()
        .replace("kraj ", "")
        .replace(" kraj", "")
        .replace("hlavní město ", "")
        .replace("hlavni mesto ", "")
    )


def lokalita_from_kraj(kraj: str | None) -> str:
    """Převede kraj z Raynetu (Moravskoslezský kraj) na lokalitu Přehledu (MSK)."""
    raw = (kraj or "").strip()
    if not raw:
        return "MSK"
    if raw in LOKALITA_KRAJE_DEFAULT:
        return raw
    needle = _norm_kraj_token(raw)
    if not needle:
        return "MSK"
    order = PRIMARY_LOKALITY + [lok for lok in LOKALITA_KRAJE_DEFAULT if lok not in PRIMARY_LOKALITY]
    for lok in order:
        if _norm_kraj_token(lok) == needle:
            return lok
        for name in LOKALITA_KRAJE_DEFAULT[lok]:
            token = _norm_kraj_token(name)
            if token == needle or token.startswith(needle) or needle.startswith(token):
                return lok
    return "MSK"


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def normalize_name(name: str | None) -> str:
    return (name or "").strip().lower()


def parse_date(val: Any) -> date | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val)[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def build_koef_index(koef_rows: list[dict]) -> dict[tuple[str, int, int], float]:
    idx: dict[tuple[str, int, int], float] = {}
    for row in koef_rows:
        idx[(row["kraj"], int(row["rok"]), int(row["mesic"]))] = float(row["koeficient"])
    return idx


def build_lokalita_kraje_map(rows: list[dict]) -> dict[str, list[str]]:
    m: dict[str, list[str]] = {k: list(v) for k, v in LOKALITA_KRAJE_DEFAULT.items()}
    for row in rows:
        lok = row["lokalita"]
        kraj = row["kraj"]
        if lok not in m:
            m[lok] = []
        if kraj not in m[lok]:
            m[lok].append(kraj)
    return m


def koeficient_pro_kraj(kraj: str, rok: int, mesic: int, idx: dict) -> float | None:
    """Jen přesná shoda měsíce – bez doplňování z jiných měsíců."""
    return idx.get((kraj, rok, mesic))


def koeficient_pro_lokalitu(
    lokalita: str,
    rok: int,
    mesic: int,
    lokalita_kraje: dict[str, list[str]],
    koef_idx: dict,
) -> float | None:
    """Průměr koeficientů krajů přiřazených k lokalitě (jako Excel AVERAGE)."""
    kraje = lokalita_kraje.get(lokalita, [])
    if not kraje:
        return None
    vals = []
    for kraj in kraje:
        v = koeficient_pro_kraj(kraj, rok, mesic, koef_idx)
        if v is not None:
            vals.append(v)
    if not vals:
        return None
    return round(sum(vals) / len(vals), 6)


def apply_podklady_koeficients(
    podklady_rows: list[dict],
    rok: int,
    mesic: int,
    lokalita_kraje: dict[str, list[str]],
    koef_idx: dict,
) -> list[dict]:
    out = []
    for row in podklady_rows:
        lok = row["lokalita"]
        kraje = lokalita_kraje.get(lok, [])
        kraje_detail = []
        for kraj in kraje:
            kv = koeficient_pro_kraj(kraj, rok, mesic, koef_idx)
            if kv is not None:
                kraje_detail.append({"kraj": kraj, "koeficient": kv})
        computed = koeficient_pro_lokalitu(lok, rok, mesic, lokalita_kraje, koef_idx)
        out.append({
            **row,
            "koeficient": computed,
            "koeficient_vypocet": computed,
            "kraje": kraje,
            "kraje_koeficienty": kraje_detail,
        })
    return out


def _daily_entry_key(entry: dict) -> tuple[str, date] | None:
    day = parse_date(entry.get("datum"))
    name = normalize_name(entry.get("jmeno"))
    if not day or not name:
        return None
    return name, day


def merge_daily_rosters(base: list[dict], overlay: list[dict]) -> list[dict]:
    """Sloučí odvozený rozpis (MSK z Raynetu) s ručními úpravami z mřížky."""
    idx: dict[tuple[str, date], dict] = {}
    for entry in base:
        key = _daily_entry_key(entry)
        if key:
            idx[key] = dict(entry)
    for entry in overlay:
        key = _daily_entry_key(entry)
        if not key:
            continue
        if key in idx:
            merged = dict(idx[key])
            if entry.get("col_index") is not None:
                merged["col_index"] = entry["col_index"]
            if entry.get("target_flag") is not None:
                merged["target_flag"] = entry["target_flag"]
            dest = str(entry.get("destination_region") or "").strip()
            if dest:
                merged["destination_region"] = dest
            idx[key] = merged
        else:
            dest = str(entry.get("destination_region") or "").strip()
            if dest or int(entry.get("target_flag") or 0) == 1:
                idx[key] = dict(entry)
    return list(idx.values())


def derive_daily_roster_from_raynet(raynet_rows: list[dict]) -> list[dict]:
    """Z Raynet hodin sestaví denní rozpis: target=1 a lokalita podle kraje zakázky."""
    entries: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for row in raynet_rows:
        if not counts_as_monter_hours(row):
            continue
        day = parse_date(row.get("naplanovano_od_datum") or row.get("naplanovano_od"))
        if not day:
            continue
        hours = float(row.get("hodin") or row.get("pocet_monterohodin") or 0)
        if hours <= 0:
            continue
        dest = lokalita_from_kraj(row.get("kraj"))
        for col in ("monter_c_1", "monter_c_2", "monter_c_3"):
            name = (row.get(col) or "").strip()
            if not name:
                continue
            key = (normalize_name(name), day.isoformat())
            if key in seen:
                continue
            seen.add(key)
            entries.append({
                "col_index": 1,
                "jmeno": name,
                "datum": day.isoformat(),
                "target_flag": 1,
                "destination_region": dest,
            })
    return entries


def roster_from_daily(daily_roster: list[dict]) -> list[dict]:
    by_name: dict[str, dict] = {}
    for entry in daily_roster:
        name = (entry.get("jmeno") or "").strip()
        if not name:
            continue
        by_name[name] = {
            "jmeno": name,
            "target_flag": int(entry.get("target_flag") or 0),
            "destination_region": entry.get("destination_region") or "",
        }
    return list(by_name.values())


def build_daily_index(daily_roster: list[dict]) -> dict[tuple[str, date], dict]:
    idx: dict[tuple[str, date], dict] = {}
    for entry in daily_roster:
        key = _daily_entry_key(entry)
        if key:
            idx[key] = entry
    return idx


def plan_hours(
    lokalita: str,
    od: date,
    do: date,
    fond: float,
    roster: list[dict],
    daily_roster: list[dict] | None = None,
) -> float:
    """Plán = počet montéro-dnů s target=1 a kam jede=lokalita × fond (jako Excel SUMPRODUCT Q/R)."""
    if daily_roster:
        total = 0.0
        for entry in daily_roster:
            day = parse_date(entry.get("datum"))
            if not day or day < od or day > do:
                continue
            if entry.get("destination_region") != lokalita:
                continue
            if int(entry.get("target_flag") or 0) != 1:
                continue
            total += fond
        return round(total, 2)

    total = 0.0
    for _day in daterange(od, do):
        for m in roster:
            if m.get("destination_region") != lokalita:
                continue
            if int(m.get("target_flag") or 0) != 1:
                continue
            total += fond
    return round(total, 2)


def build_member_hours_index(raynet_rows: list[dict]) -> dict[tuple[str, date], float]:
    """Součet hodin montéra po dnech z Raynet (sloupec P v měsíčním listu)."""
    idx: dict[tuple[str, date], float] = {}
    for row in raynet_rows:
        if not counts_as_monter_hours(row):
            continue
        day = parse_date(row.get("naplanovano_od_datum") or row.get("naplanovano_od"))
        if not day:
            continue
        hours = float(row.get("hodin") or row.get("pocet_monterohodin") or 0)
        if hours <= 0:
            continue
        for col in ("monter_c_1", "monter_c_2", "monter_c_3"):
            name = normalize_name(row.get(col))
            if not name:
                continue
            key = (name, day)
            idx[key] = round(idx.get(key, 0.0) + hours, 2)
    return idx


def _hours_for_roster_entry(entry: dict, member_hours: dict[tuple[str, date], float]) -> float:
    """Hodiny pro slot rozpisu – stejné jméno může být ve více sloupcích Excelu."""
    day = parse_date(entry.get("datum"))
    name = normalize_name(entry.get("jmeno"))
    if not day or not name:
        return 0.0
    total = member_hours.get((name, day), 0.0)
    if total <= 0:
        return 0.0
    return total


def scheduled_hours(
    lokalita: str,
    od: date,
    do: date,
    roster: list[dict],
    raynet_rows: list[dict],
    daily_roster: list[dict] | None = None,
    member_hours: dict[tuple[str, date], float] | None = None,
) -> float:
    if daily_roster:
        hours_idx = member_hours if member_hours is not None else build_member_hours_index(raynet_rows)
        total = 0.0
        for entry in daily_roster:
            day = parse_date(entry.get("datum"))
            if not day or day < od or day > do:
                continue
            if entry.get("destination_region") != lokalita:
                continue
            if int(entry.get("target_flag") or 0) != 1:
                continue
            total += _hours_for_roster_entry(entry, hours_idx)
        return round(total, 2)

    active = {
        normalize_name(m["jmeno"])
        for m in roster
        if m.get("destination_region") == lokalita and int(m.get("target_flag") or 0) == 1
    }
    if not active:
        return 0.0

    total = 0.0
    for row in raynet_rows:
        if not counts_as_monter_hours(row):
            continue
        day = parse_date(row.get("naplanovano_od") or row.get("naplanovano_od_datum"))
        if not day or day < od or day > do:
            continue
        hours = float(row.get("hodin") or row.get("pocet_monterohodin") or 0)
        if hours <= 0:
            continue
        montri = [
            normalize_name(row.get("monter_c_1")),
            normalize_name(row.get("monter_c_2")),
            normalize_name(row.get("monter_c_3")),
        ]
        if any(m in active for m in montri if m):
            total += hours
    return round(total, 2)


def compute_period_row(
    obdobi: dict,
    podklady: dict[str, dict],
    roster: list[dict],
    raynet_rows: list[dict],
    daily_roster: list[dict] | None = None,
    member_hours: dict[tuple[str, date], float] | None = None,
) -> dict:
    od = parse_date(obdobi["od"])
    do = parse_date(obdobi["do"])
    lok = obdobi["lokalita"]
    fond = float(podklady.get(lok, {}).get("fond") or 0)
    raw_koef = podklady.get(lok, {}).get("koeficient")
    koef = float(raw_koef) if raw_koef is not None else None

    plan_a = plan_hours(lok, od, do, fond, roster, daily_roster) if od and do else 0
    sched_a = scheduled_hours(
        lok, od, do, roster, raynet_rows, daily_roster, member_hours,
    ) if od and do else 0
    plan_h = 0.0
    sched_h = 0.0

    if od and do and od.month != do.month:
        boundary = date(do.year, do.month, 1)
        last_prev = boundary - timedelta(days=1)
        plan_a = plan_hours(lok, od, last_prev, fond, roster, daily_roster)
        sched_a = scheduled_hours(
            lok, od, last_prev, roster, raynet_rows, daily_roster, member_hours,
        )
        plan_h = plan_hours(lok, boundary, do, fond, roster, daily_roster)
        sched_h = scheduled_hours(
            lok, boundary, do, roster, raynet_rows, daily_roster, member_hours,
        )

    plan_celkem = round(plan_a + plan_h, 2)
    sched_celkem = round(sched_a + sched_h, 2)
    missing_ks = (
        round((plan_celkem - sched_celkem) / koef, 2)
        if koef is not None and koef != 0
        else None
    )
    ordered = float(obdobi.get("objednano_ks") or 0)
    celkem_zakazek = float(obdobi.get("celkem_zakazek") or 0)
    lze_objednat = round(missing_ks - ordered, 2) if missing_ks is not None else None
    plneni = round(sched_celkem / plan_celkem, 4) if plan_celkem else 0

    return {
        "id": obdobi.get("id"),
        "ciselnik_id": obdobi.get("ciselnik_id"),
        "od": od.isoformat() if od else None,
        "do": do.isoformat() if do else None,
        "skupina": obdobi.get("skupina") or lok,
        "lokalita": lok,
        "plan_hod": plan_a,
        "naplanovano_hod": sched_a,
        "plan_prelom": plan_h,
        "naplanovano_prelom": sched_h,
        "plan_celkem": plan_celkem,
        "naplanovano_celkem": sched_celkem,
        "plneni": plneni,
        "kolik_chybi_ks": missing_ks,
        "objednano_ks": ordered,
        "celkem_zakazek": celkem_zakazek,
        "lze_objednat_ks": lze_objednat,
        "posunout_vyrobu": obdobi.get("posunout_vyrobu") or "NE",
        "fond": fond,
        "koeficient": koef,
    }


def compute_overview(
    obdobi_rows: list[dict],
    podklady_rows: list[dict],
    roster: list[dict],
    raynet_rows: list[dict],
    filter_od: date | None = None,
    filter_do: date | None = None,
    nastaveni: dict | None = None,
    koef_rows: list[dict] | None = None,
    lokalita_kraje_rows: list[dict] | None = None,
    daily_roster: list[dict] | None = None,
) -> dict:
    nastaveni = nastaveni or {"nastaveny_mesic": 6, "nastaveny_rok": 2026}
    rok = int(nastaveni.get("nastaveny_rok") or 2026)
    mesic = int(nastaveni.get("nastaveny_mesic") or 6)

    koef_idx = build_koef_index(koef_rows or [])
    lok_map = build_lokalita_kraje_map(lokalita_kraje_rows or [])
    podklady_rows = apply_podklady_koeficients(podklady_rows, rok, mesic, lok_map, koef_idx)

    podklady = {r["lokalita"]: r for r in podklady_rows}
    member_hours = build_member_hours_index(raynet_rows) if daily_roster else None
    rows = []
    for ob in sorted(obdobi_rows, key=lambda r: (r.get("sort_order") or 0, r.get("id") or 0)):
        od = parse_date(ob.get("od"))
        do = parse_date(ob.get("do"))
        if filter_od and do and do < filter_od:
            continue
        if filter_do and od and od > filter_do:
            continue
        rows.append(compute_period_row(
            ob, podklady, roster, raynet_rows, daily_roster, member_hours,
        ))

    totals = {
        "pocet_lokalit": len(rows),
        "plan_celkem": round(sum(r["plan_celkem"] for r in rows), 2),
        "naplanovano_celkem": round(sum(r["naplanovano_celkem"] for r in rows), 2),
        "kolik_chybi_ks": round(
            sum(r["kolik_chybi_ks"] for r in rows if r["kolik_chybi_ks"] is not None),
            2,
        ),
        "objednano_ks": round(sum(r["objednano_ks"] for r in rows), 2),
        "celkem_zakazek": round(sum(r["celkem_zakazek"] for r in rows), 2),
        "plneni": 0,
    }
    if totals["plan_celkem"]:
        totals["plneni"] = round(totals["naplanovano_celkem"] / totals["plan_celkem"], 4)

    koef_grid = build_koef_grid(koef_rows or [], rok)

    return {
        "rows": rows,
        "totals": totals,
        "podklady": podklady_rows,
        "nastaveni": nastaveni,
        "koeficienty_kraje": koef_grid,
        "kraje_list": KRAJE_LIST,
    }


def build_koef_grid(koef_rows: list[dict], rok: int) -> list[dict]:
    by_kraj: dict[str, dict[int, float]] = {}
    for row in koef_rows:
        if int(row["rok"]) != rok:
            continue
        by_kraj.setdefault(row["kraj"], {})[int(row["mesic"])] = float(row["koeficient"])
    grid = []
    for kraj in KRAJE_LIST:
        months = by_kraj.get(kraj, {})
        grid.append({
            "kraj": kraj,
            "mesice": {
                str(m): months[m] if m in months else ""
                for m in range(1, 13)
            },
        })
    return grid
