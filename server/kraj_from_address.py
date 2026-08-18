"""Odvození kraje z města nebo PSČ, když Raynet nemá vyplněné province."""

from __future__ import annotations

import re
from typing import Any

_DIACRITICS = str.maketrans(
    "áčďéěíňóřšťúůýžäöüÁČĎÉĚÍŇÓŘŠŤÚŮÝŽÄÖÜ",
    "acdeeinorstuuyzaouACDEEINORSTUUYZAOU",
)

CITY_TO_KRAJ = {
    "praha": "Hlavní město Praha",
    "brno": "Jihomoravský kraj",
    "ostrava": "Moravskoslezský kraj",
    "plzen": "Plzeňský kraj",
    "liberec": "Liberecký kraj",
    "olomouc": "Olomoucký kraj",
    "ceske budejovice": "Jihočeský kraj",
    "budejovice": "Jihočeský kraj",
    "hradec kralove": "Královéhradecký kraj",
    "usti nad labem": "Ústecký kraj",
    "pardubice": "Pardubický kraj",
    "zlin": "Zlínský kraj",
    "havirov": "Moravskoslezský kraj",
    "kladno": "Středočeský kraj",
    "most": "Ústecký kraj",
    "opava": "Moravskoslezský kraj",
    "frydek mistek": "Moravskoslezský kraj",
    "karvina": "Moravskoslezský kraj",
    "jihlava": "Kraj Vysočina",
    "teplice": "Ústecký kraj",
    "decin": "Ústecký kraj",
    "karlovy vary": "Karlovarský kraj",
    "chomutov": "Ústecký kraj",
    "jablonec": "Liberecký kraj",
    "jablonec nad nisou": "Liberecký kraj",
    "mlada boleslav": "Středočeský kraj",
    "prostejov": "Olomoucký kraj",
    "prerov": "Olomoucký kraj",
    "trebic": "Kraj Vysočina",
    "trinec": "Moravskoslezský kraj",
    "znojmo": "Jihomoravský kraj",
    "kolin": "Středočeský kraj",
    "pribram": "Středočeský kraj",
    "cheb": "Karlovarský kraj",
    "pisek": "Jihočeský kraj",
    "trutnov": "Královéhradecký kraj",
    "orlova": "Moravskoslezský kraj",
    "kromeriz": "Zlínský kraj",
    "vsetin": "Zlínský kraj",
    "sumperk": "Olomoucký kraj",
    "uherske hradiste": "Zlínský kraj",
    "hodonin": "Jihomoravský kraj",
    "breclav": "Jihomoravský kraj",
    "cesky tesin": "Moravskoslezský kraj",
    "litomerice": "Ústecký kraj",
    "novy jicin": "Moravskoslezský kraj",
    "ceska lipa": "Liberecký kraj",
    "tabor": "Jihočeský kraj",
    "melnik": "Středočeský kraj",
    "beroun": "Středočeský kraj",
    "benesov": "Středočeský kraj",
    "nymburk": "Středočeský kraj",
    "podebrady": "Středočeský kraj",
    "kutna hora": "Středočeský kraj",
    "rakovnik": "Středočeský kraj",
    "slany": "Středočeský kraj",
    "jicin": "Královéhradecký kraj",
    "nachod": "Královéhradecký kraj",
    "rychnov nad kneznou": "Královéhradecký kraj",
    "svitavy": "Pardubický kraj",
    "usti nad orlici": "Pardubický kraj",
    "chrudim": "Pardubický kraj",
    "havlickuv brod": "Kraj Vysočina",
    "zdar nad sazavou": "Kraj Vysočina",
    "pelhrimov": "Kraj Vysočina",
    "blansko": "Jihomoravský kraj",
    "vyskov": "Jihomoravský kraj",
    "uhersky brod": "Zlínský kraj",
    "otrokovice": "Zlínský kraj",
    "koprivnice": "Moravskoslezský kraj",
    "bohumin": "Moravskoslezský kraj",
    "krnov": "Moravskoslezský kraj",
    "bruntal": "Moravskoslezský kraj",
    "jesenik": "Olomoucký kraj",
    "louny": "Ústecký kraj",
    "litvinov": "Ústecký kraj",
    "jirkov": "Ústecký kraj",
    "kadan": "Ústecký kraj",
    "turnov": "Liberecký kraj",
    "semily": "Liberecký kraj",
    "jindrichuv hradec": "Jihočeský kraj",
    "strakonice": "Jihočeský kraj",
    "cesky krumlov": "Jihočeský kraj",
    "prachatice": "Jihočeský kraj",
    "domazlice": "Plzeňský kraj",
    "klatovy": "Plzeňský kraj",
    "rokycany": "Plzeňský kraj",
    "sokolov": "Karlovarský kraj",
    "ostrov": "Karlovarský kraj",
    "brandys nad labem": "Středočeský kraj",
    "celakovice": "Středočeský kraj",
    "ricany": "Středočeský kraj",
}

# První 3 čísla PSČ → kraj (přibližné rozsahy České pošty).
PSC_RANGES = [
    (100, 199, "Hlavní město Praha"),
    (250, 294, "Středočeský kraj"),
    (301, 348, "Plzeňský kraj"),
    (350, 364, "Karlovarský kraj"),
    (370, 398, "Jihočeský kraj"),
    (400, 441, "Ústecký kraj"),
    (460, 473, "Liberecký kraj"),
    (500, 518, "Královéhradecký kraj"),
    (547, 552, "Královéhradecký kraj"),
    (530, 539, "Pardubický kraj"),
    (560, 571, "Pardubický kraj"),
    (580, 595, "Kraj Vysočina"),
    (600, 685, "Jihomoravský kraj"),
    (690, 697, "Jihomoravský kraj"),
    (686, 688, "Zlínský kraj"),
    (755, 769, "Zlínský kraj"),
    (700, 739, "Moravskoslezský kraj"),
    (746, 747, "Moravskoslezský kraj"),
    (793, 794, "Moravskoslezský kraj"),
    (750, 751, "Olomoucký kraj"),
    (770, 789, "Olomoucký kraj"),
]


def _clean(value: Any) -> str:
    return str(value or "").strip()


def normalize_city(value: Any) -> str:
    text = _clean(value).translate(_DIACRITICS).lower()
    text = text.replace("-", " ").replace(".", " ")
    text = re.sub(r"\s+", " ", text)
    for sep in (",", ";", "/"):
        if sep in text:
            text = text.split(sep, 1)[0].strip()
    return text


def kraj_from_city(city: Any) -> str:
    needle = normalize_city(city)
    if not needle:
        return ""
    if needle in CITY_TO_KRAJ:
        return CITY_TO_KRAJ[needle]
    # "Ostrava Poruba", "Praha 4"
    for key, kraj in CITY_TO_KRAJ.items():
        if needle.startswith(key + " ") or needle.startswith(key + "-"):
            return kraj
    return ""


def kraj_from_psc(zip_code: Any) -> str:
    digits = re.sub(r"\D", "", _clean(zip_code))
    if len(digits) < 3:
        return ""
    prefix = int(digits[:3])
    for start, end, kraj in PSC_RANGES:
        if start <= prefix <= end:
            return kraj
    return ""


def infer_kraj_from_address(address: dict | None, extra_city: str = "") -> str:
    """Kraj z province, jinak z města, jinak z PSČ."""
    address = address or {}
    province = _clean(address.get("province"))
    if province:
        return province
    city = _clean(address.get("city")) or extra_city
    kraj = kraj_from_city(city)
    if kraj:
        return kraj
    return kraj_from_psc(address.get("zipCode") or address.get("zip") or address.get("psc"))
