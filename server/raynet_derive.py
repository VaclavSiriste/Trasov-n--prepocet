"""Odvození sloupců montérů z účastníků – stejná logika jako Excel (list Podklady!B)."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any


def normalize_name(name: str | None) -> str:
    return (name or "").strip().lower()


# Seznam montérů z Excelu „Podklady“ sloupec B (pořadí zachováno pro výběr montérů).
MONTERI_SEZNAM: list[str] = [
    "Jaroslav Balog",
    "Dominik Žihala",
    "Mirek Truhelka",
    "Jakub Krejza",
    "Vojtěch Žihala",
    "Karel Vengřinovič",
    "Tomáš Bok",
    "Stanislav Ivanov",
    "Roman Bek",
    "Filip Špígl",
    "Viktor Heger",
    "Adam Blažej",
    "Martin Strakoš",
    "Vladimír Novotný",
    "Petr Griač",
    "Kamil Beneš",
    "Radomír Ipri",
    "Arnošt Mynář",
    "Josef Fojtík",
    "Rostislav Vjačka",
    "Milan Smutný",
    "Miroslav Pecháček",
    "David Vallo",
    "Jakub Bečvář",
    "Jiří Dvořák",
    "Michal Kurfiřt",
    "Roman Marejka",
    "Jan Lorenc",
    "Radek Smoček",
    "René Berger",
    "Martin Bursík",
    "Petr Orel",
    "David Dočkal",
    "Matěj Čerych",
    "Maksim Dziarabkin",
    "Denis Willert",
    "Vladimir Chmelík",
    "Norbert Bider",
    "Tomáš Nesvačil",
    "Martin Žák",
    "Daniel Krkoška",
    "Jakub Fišer",
    "René Rovňak",
    "Jan Zemčík",
    "Lukáš Pospíšil",
    "Ondřej Crha",
    "Radovan Tesař",
    "Jan Perlík",
    "Václav Vála",
    "Tomáš Stoklasa",
    "Pavel Čajka",
    "Karel Kretschmann",
]

# Historické / překlepové varianty jmen → kanonické jméno ze seznamu.
MONTERI_ALIASES: dict[str, str] = {
    "pavel čejka": "Pavel Čajka",
}


def parse_ucastnici(ucastnici: str | None) -> list[str]:
    if not ucastnici:
        return []
    return [p.strip() for p in str(ucastnici).split(",") if p.strip()]


def extract_monteri(ucastnici: str | None) -> list[str]:
    """Vrátí montéry v pořadí ze seznamu Podklady (jako Excel sloupec G)."""
    tokens = {normalize_name(t) for t in parse_ucastnici(ucastnici)}
    # Přemapuj aliasy (např. Čejka → Čajka), ať sedí i starší data z Raynetu.
    tokens |= {
        normalize_name(MONTERI_ALIASES[t])
        for t in tokens
        if t in MONTERI_ALIASES
    }
    found: list[str] = []
    for name in MONTERI_SEZNAM:
        if normalize_name(name) in tokens:
            found.append(name)
    return found


def trvani_to_hours(trvani: Any) -> float:
    if trvani is None:
        return 0.0
    if isinstance(trvani, timedelta):
        return round(trvani.total_seconds() / 3600, 2)
    if isinstance(trvani, time):
        return round((trvani.hour * 3600 + trvani.minute * 60 + trvani.second) / 3600, 2)
    if isinstance(trvani, datetime):
        return round(trvani.hour + trvani.minute / 60 + trvani.second / 3600, 2)
    s = str(trvani).strip()
    if not s:
        return 0.0
    if ":" in s:
        parts = s.split(":")
        try:
            if len(parts) == 3:
                h, m, sec = int(parts[0]), int(parts[1]), float(parts[2])
                return round(h + m / 60 + sec / 3600, 2)
            if len(parts) == 2:
                h, m = int(parts[0]), int(parts[1])
                return round(h + m / 60, 2)
        except ValueError:
            pass
    return 0.0


# Kategorie bez montérohodin – v Excelu je sloupec M (hodin) prázdný (např. dovolená = 23:59).
KATEGORIE_BEZ_MONTEROHODIN = frozenset({"Dovolená"})


def counts_as_monter_hours(row: dict) -> bool:
    return (row.get("kategorie") or "").strip() not in KATEGORIE_BEZ_MONTEROHODIN


def sql_monter_hours_filter(alias: str = "") -> str:
    prefix = f"{alias}." if alias else ""
    excluded = ", ".join(f"'{k}'" for k in sorted(KATEGORIE_BEZ_MONTEROHODIN))
    return f"COALESCE({prefix}kategorie, '') NOT IN ({excluded})"


def enrich_montaze_row(row: dict) -> dict:
    """Doplní sloupce G–M (montéři, hodiny) jako vzorce v Excelu Raynet MONTÁŽE."""
    monteri = extract_monteri(row.get("ucastnici"))
    hours = trvani_to_hours(row.get("trvani"))
    count = len(monteri)

    row["monteri"] = ", ".join(monteri) if monteri else None
    row["monter_c_1"] = monteri[0] if count > 0 else None
    row["monter_c_2"] = monteri[1] if count > 1 else None
    row["monter_c_3"] = monteri[2] if count > 2 else None
    row["monteru"] = float(count) if count else None
    if count and counts_as_monter_hours(row):
        row["hodin"] = hours
        row["pocet_monterohodin"] = round(hours * count, 2)
    else:
        row["hodin"] = None
        row["pocet_monterohodin"] = None
    row.setdefault("kraj", None)
    return row
