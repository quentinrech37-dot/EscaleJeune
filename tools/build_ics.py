#!/usr/bin/env python3
"""
Génère calendrier.ics à partir de data/calendrier.json.

Usage (depuis la racine du site) :
    python tools/build_ics.py

À relancer chaque fois que data/calendrier.json change, puis commiter
calendrier.ics avec le reste. Les agendas abonnés (Apple, Google, Outlook)
se mettent alors à jour tout seuls.

Champs reconnus dans une activité : date (AAAA-MM-JJ), heure (HH:MM, facultatif),
titre, lieu, resume, details, contact, lien, type, duree (minutes, facultatif),
rappel (minutes avant le début, facultatif ; 0 = au moment même).
Sans heure, l'activité est inscrite comme événement sur la journée entière.
"""
import json
import re
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "calendrier.json"
DST = ROOT / "calendrier.ics"

TZ = "Europe/Paris"
DUREE_PAR_TYPE = {"messe": 60, "repas": 120, "soiree": 180, "sortie": 240}
DUREE_DEFAUT = 120

VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    f"TZID:{TZ}",
    f"X-LIC-LOCATION:{TZ}",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
]


def slug(s):
    s = unicodedata.normalize("NFD", str(s or "activite"))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:40] or "activite"


def esc(s):
    s = str(s if s is not None else "")
    s = s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    return re.sub(r"\r\n|\r|\n", "\\\\n", s)


def fold(line):
    if len(line.encode("utf-8")) <= 75:
        return line
    out, cur, cur_b, limit = [], "", 0, 75
    for ch in line:
        b = len(ch.encode("utf-8"))
        if cur_b + b > limit:
            out.append(cur)
            cur, cur_b, limit = "", 0, 74
        cur += ch
        cur_b += b
    out.append(cur)
    return "\r\n ".join(out)


def parse_local(date, heure):
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", str(date or "").strip())
    if not m:
        return None, False
    y, mo, d = map(int, m.groups())
    h = re.fullmatch(r"(\d{1,2})[:h](\d{2})", str(heure or "").strip())
    if not h:
        return datetime(y, mo, d), True
    return datetime(y, mo, d, int(h.group(1)), int(h.group(2))), False


def duree(e):
    try:
        n = float(e.get("duree"))
        if n > 0:
            return int(n)
    except (TypeError, ValueError):
        pass
    return DUREE_PAR_TYPE.get(e.get("type"), DUREE_DEFAUT)


def description(e):
    parts = []
    if e.get("resume"):
        parts.append(e["resume"])
    if e.get("details"):
        parts.append(e["details"])
    if e.get("contact"):
        parts.append(f"Contact : {e['contact']}")
    if e.get("lien"):
        parts.append(e["lien"])
    return "\n\n".join(parts)


def vevent(e, stamp):
    t, all_day = parse_local(e.get("date"), e.get("heure"))
    if t is None:
        return []
    L = ["BEGIN:VEVENT", f"UID:{e['date']}-{slug(e.get('titre'))}@aumonerie-besancon", f"DTSTAMP:{stamp}"]
    if all_day:
        L.append(f"DTSTART;VALUE=DATE:{t:%Y%m%d}")
        L.append(f"DTEND;VALUE=DATE:{t + timedelta(days=1):%Y%m%d}")
    else:
        L.append(f"DTSTART;TZID={TZ}:{t:%Y%m%dT%H%M%S}")
        L.append(f"DTEND;TZID={TZ}:{t + timedelta(minutes=duree(e)):%Y%m%dT%H%M%S}")
    L.append(f"SUMMARY:{esc(e.get('titre') or 'Activité')}")
    if e.get("lieu"):
        L.append(f"LOCATION:{esc(e['lieu'])}")
    desc = description(e)
    if desc:
        L.append(f"DESCRIPTION:{esc(desc)}")
    if re.match(r"https?://", str(e.get("lien") or ""), re.I):
        L.append(f"URL:{e['lien']}")
    # Rappel facultatif : "rappel" = minutes avant le début (0 = au moment même)
    try:
        r = float(e.get("rappel"))
    except (TypeError, ValueError):
        r = None
    if r is not None and r >= 0 and not all_day:
        L += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{esc(e.get('titre') or 'Rappel')}",
              "TRIGGER:PT0S" if r == 0 else f"TRIGGER:-PT{round(r)}M", "END:VALARM"]
    L.append("END:VEVENT")
    return L


def main():
    events = json.loads(SRC.read_text(encoding="utf-8"))
    events = sorted((e for e in events if parse_local(e.get("date"), e.get("heure"))[0]),
                    key=lambda e: (e["date"], e.get("heure") or ""))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0",
        "PRODID:-//Aumonerie Besancon//Activites//FR",
        "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "X-WR-CALNAME:Aumônerie - Activités",
        f"X-WR-TIMEZONE:{TZ}",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "X-PUBLISHED-TTL:PT6H",
        *VTIMEZONE,
    ]
    for e in events:
        lines.extend(vevent(e, stamp))
    lines.append("END:VCALENDAR")
    DST.write_bytes(("\r\n".join(fold(l) for l in lines) + "\r\n").encode("utf-8"))
    print(f"{len(events)} activité(s) écrite(s) dans {DST.name}")


if __name__ == "__main__":
    sys.exit(main())
