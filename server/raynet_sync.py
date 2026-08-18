"""Synchronizace Raynet API -> PostgreSQL."""

from __future__ import annotations

import base64
import os
from datetime import datetime, time, timedelta, timezone
from typing import Any

import requests

from raynet_derive import enrich_montaze_row

MAIN_PARAMS = {
    "date": "2025-01-01 00:00",
    "owner": 152,
    "state": "CANCELLED",
    "category": [220, 221, 223, 222, 336, 249, 233, 348],
}

PREJEZDY_PARAMS = {
    "date": "2026-01-01 00:00",
    "owner": 152,
    "state": "CANCELLED",
    "category": [225],
}

ZAMEROVACI_INSERT_COLS = [
    "kategorie", "naplanovano_od", "naplanovano_do", "trvani", "predmet",
    "ucastnici", "misto_setkani", "stitky", "mesic", "rok",
    "naplanovano_od_datum", "mesic_datum",
]

MONTAZE_INSERT_COLS = [
    "kategorie", "naplanovano_od", "naplanovano_do", "trvani", "predmet",
    "ucastnici", "monteri", "monter_c_1", "monter_c_2", "monter_c_3",
    "monteru", "pocet_monterohodin", "hodin", "mesic", "naplanovano_od_datum",
    "mesic_datum", "misto_setkani", "kraj", "rok", "stitky",
]

PREJEZDY_INSERT_COLS = [
    "kategorie", "cas_od", "cas_do", "trvani", "predmet", "technik", "hodiny",
    "naplanovano_od", "naplanovano_do", "mesic", "rok", "tyden", "mvt",
    "pocet_km_na_zakazku",
]


def parse_ts(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    s = str(value).strip()
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M",
    ):
        try:
            dt = datetime.strptime(s.replace("Z", "+0000"), fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def calculate_duration(start: Any, end: Any) -> timedelta | None:
    d1 = parse_ts(start)
    d2 = parse_ts(end)
    if not d1 or not d2:
        return None
    return abs(d2 - d1)


def duration_to_time(delta: timedelta | None) -> time | None:
    if delta is None:
        return None
    total = int(delta.total_seconds())
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return time(h, m, s)


def join_participants(participants: list[dict] | None) -> str:
    if not participants:
        return ""
    return ", ".join(p.get("name", "") for p in participants if p.get("name"))


def join_tags(tags: list | None) -> str:
    if not tags:
        return ""
    return ", ".join(str(t) for t in tags)


def owner_name(item: dict) -> str:
    for p in item.get("participants") or []:
        if p.get("owner") is True:
            return p.get("name") or ""
    return ""


def call_raynet_api(
    *,
    username: str,
    api_key: str,
    instance: str,
    parameters: dict,
    offset: int,
    category_index: int,
) -> dict:
    category_id = parameters["category"][category_index]
    url = (
        "https://app.raynet.cz/api/v2/event/"
        f"?offset={offset}&limit=1000"
        f"&scheduledFrom[GE]={parameters['date']}"
        f"&owner-id[NE]={parameters['owner']}"
        f"&category-id={category_id}"
        f"&status[NE]={parameters['state']}"
        "&sortColumn=scheduledFrom&sortDirection=DESC"
    )
    auth = base64.b64encode(f"{username}:{api_key}".encode()).decode()
    headers = {
        "Accept": "application/json",
        "Authorization": f"Basic {auth}",
        "X-Instance-Name": instance,
    }
    resp = requests.get(url, headers=headers, timeout=120)
    if resp.status_code != 200:
        raise RuntimeError(f"Raynet API {resp.status_code}: {resp.text[:500]}")
    return resp.json()


def api_fetch(username: str, api_key: str, instance: str, parameters: dict) -> list[dict]:
    all_responses: list[dict] = []
    n_cat = len(parameters["category"])
    for j in range(n_cat):
        offset = 0
        i = 0
        print(f"  Raynet kategorie {j + 1}/{n_cat} (id={parameters['category'][j]})…", flush=True)
        while True:
            response = call_raynet_api(
                username=username,
                api_key=api_key,
                instance=instance,
                parameters=parameters,
                offset=offset,
                category_index=j,
            )
            all_responses.append(response)
            data = response.get("data") or []
            print(f"    offset={offset}: {len(data)} záznamů", flush=True)
            if len(data) < 1000 or len(all_responses[i].get("data") or []) % 1000 != 0:
                break
            offset += 1000
            i += 1
    return all_responses


def flatten_main_events(all_responses: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for response in all_responses:
        for item in response.get("data") or []:
            start = item.get("scheduledFrom")
            end = item.get("scheduledTill")
            ts_start = parse_ts(start)
            rows.append({
                "kategorie": (item.get("category") or {}).get("value") or "",
                "naplanovano_od": ts_start,
                "naplanovano_do": parse_ts(end),
                "trvani": calculate_duration(start, end),
                "predmet": item.get("title") or "",
                "ucastnici": join_participants(item.get("participants")),
                "misto_setkani": item.get("meetingPlace") or "",
                "kraj": ((item.get("companyAddress") or {}).get("province") or ""),
                "stitky": join_tags(item.get("tags")),
                "mesic": ts_start.month if ts_start else None,
                "rok": ts_start.year if ts_start else None,
                "naplanovano_od_datum": ts_start.date() if ts_start else None,
                "mesic_datum": ts_start.month if ts_start else None,
            })
    return rows


def split_montaze_zamerovaci(
    all_responses: list[dict], all_rows: list[dict]
) -> tuple[list[dict], list[dict]]:
    if not all_responses:
        return [], []
    first_batch_length = all_responses[0].get("totalCount") or 0
    if first_batch_length > len(all_rows):
        first_batch_length = len(all_rows)
    zamerovaci = all_rows
    montaze = [enrich_montaze_row(dict(r)) for r in all_rows[first_batch_length:]]
    return montaze, zamerovaci


def flatten_prejezdy_events(data: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for item in data:
        start = item.get("scheduledFrom")
        end = item.get("scheduledTill")
        ts_start = parse_ts(start)
        ts_end = parse_ts(end)
        delta = calculate_duration(start, end)
        rows.append({
            "kategorie": (item.get("category") or {}).get("value") or "",
            "cas_od": ts_start,
            "cas_do": ts_end,
            "trvani": duration_to_time(delta),
            "predmet": item.get("title") or "",
            "technik": owner_name(item),
            "hodiny": round(delta.total_seconds() / 3600, 2) if delta else None,
            "naplanovano_od": ts_start.date() if ts_start else None,
            "naplanovano_do": ts_end.date() if ts_end else None,
            "mesic": ts_start.month if ts_start else None,
            "rok": ts_start.year if ts_start else None,
            "tyden": ts_start.isocalendar()[1] if ts_start else None,
            "mvt": owner_name(item),
            "pocet_km_na_zakazku": None,
        })
    return rows


def api_fetch_prejezdy_flat(username: str, api_key: str, instance: str) -> list[dict]:
    all_data: list[dict] = []
    for j in range(len(PREJEZDY_PARAMS["category"])):
        offset = 0
        while True:
            response = call_raynet_api(
                username=username,
                api_key=api_key,
                instance=instance,
                parameters=PREJEZDY_PARAMS,
                offset=offset,
                category_index=j,
            )
            batch = response.get("data") or []
            if not batch:
                break
            all_data.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
    return flatten_prejezdy_events(all_data)


def row_to_tuple(row: dict, cols: list[str]) -> tuple:
    return tuple(row.get(c) for c in cols)


def replace_table(conn, table: str, cols: list[str], rows: list[dict]) -> int:
    from psycopg2.extras import execute_batch

    placeholders = ", ".join(["%s"] * len(cols))
    col_list = ", ".join(cols)
    sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"
    values = [row_to_tuple(r, cols) for r in rows]
    with conn.cursor() as cur:
        cur.execute(f"TRUNCATE TABLE {table} RESTART IDENTITY")
        if values:
            execute_batch(cur, sql, values, page_size=500)
    return len(values)


def sync_main(conn, username: str, api_key: str, instance: str) -> dict[str, int]:
    responses = api_fetch(username, api_key, instance, MAIN_PARAMS)
    all_rows = flatten_main_events(responses)
    montaze, zamerovaci = split_montaze_zamerovaci(responses, all_rows)
    n_z = replace_table(conn, "raynet_zamerovaci", ZAMEROVACI_INSERT_COLS, zamerovaci)
    n_m = replace_table(conn, "raynet_montaze", MONTAZE_INSERT_COLS, montaze)
    return {"raynet_zamerovaci": n_z, "raynet_montaze": n_m}


def sync_prejezdy(conn, username: str, api_key: str, instance: str) -> dict[str, int]:
    rows = api_fetch_prejezdy_flat(username, api_key, instance)
    n = replace_table(conn, "raynet_prejezdy", PREJEZDY_INSERT_COLS, rows)
    return {"raynet_prejezdy": n}


def run_sync(conn, only: str = "all") -> dict[str, Any]:
    instance = os.environ.get("RAYNET_INSTANCE", "demaxia")
    main_user = os.environ.get("RAYNET_USERNAME")
    main_key = os.environ.get("RAYNET_API_KEY")
    prej_user = os.environ.get("RAYNET_PREJEZDY_USERNAME", main_user)
    prej_key = os.environ.get("RAYNET_PREJEZDY_API_KEY", main_key)

    if only in ("main", "all") and (not main_user or not main_key):
        raise ValueError("Chybí RAYNET_USERNAME nebo RAYNET_API_KEY v .env")
    if only in ("prejezdy", "all") and (not prej_user or not prej_key):
        raise ValueError("Chybí RAYNET_PREJEZDY_USERNAME nebo RAYNET_PREJEZDY_API_KEY v .env")

    counts: dict[str, int] = {}
    if only in ("main", "all"):
        counts.update(sync_main(conn, main_user, main_key, instance))
    if only in ("prejezdy", "all"):
        counts.update(sync_prejezdy(conn, prej_user, prej_key, instance))
    return {"ok": True, "counts": counts}
