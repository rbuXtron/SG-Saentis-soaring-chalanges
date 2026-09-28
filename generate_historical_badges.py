#!/usr/bin/env python3
"""
generate_historical_badges.py — historical-badges-<jahr>.json erzeugen
======================================================================

Erzeugt die Abzugs-Datei für den Multi-Level-Badge-Evaluator: pro Pilot
den STAND AM SAISONENDE je Multi-Level-Badge — korrekt aus der FLUG-
HISTORIE (scoring_date), NICHT aus 'created' (das datiert Level falsch).

Wird jeweils am Saisonende laufen gelassen. Das File für Saison N dient
als Vorsaison-Abzug für Saison N+1:
    historical-badges-2024.json  ->  Abzug für Saison 2025
    historical-badges-2025.json  ->  Abzug für Saison 2026

Format (kompatibel zu multi-level-badge-evaluator.js):
    {
      "metadata": {...},
      "badgeDefinitions": { badge_id: {name, points, values, ...} },
      "pilots": { "<userId>": { "name": "...", "badges": { badge_id: level } } }
    }
    -> pilots[userId].badges[badge_id] = höchstes bis Saisonende erflogenes Level

KEINE ABHÄNGIGKEITEN (nur urllib). KEIN API-Key — über den Proxy.
ACHTUNG: 1 Request pro Flug — Disk-Cache aktiv, Erstlauf dauert.

Beispiele:
  # File für Ende Saison 2025 (Stichtag 30.09.2025):
  python generate_historical_badges.py --season 2025 \
      --proxy https://sgsaentiscup.vercel.app/api/proxy \
      --out historical-badges-2025.json

  # Nur ein Pilot zur Kontrolle:
  python generate_historical_badges.py --season 2025 --user 29951 \
      --proxy https://sgsaentiscup.vercel.app/api/proxy
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

CLUB_ID     = 1281
BASE_URL    = "https://api.weglide.org/v1"
CACHE_DIR   = Path(os.environ.get("WEGLIDE_CACHE_DIR", ".weglide_cache"))
CACHE_TTL_H = float(os.environ.get("WEGLIDE_CACHE_TTL_H", 168))  # 7 Tage
TIMEOUT     = 30
PAUSE       = 0.25
FLIGHT_PAGE = 100

BROWSER_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/120.0.0.0 Safari/537.36"),
    "Referer": "https://weglide.org/",
    "Origin": "https://weglide.org",
}


class WeGlideClient:
    def __init__(self, proxy=None, api_key=None, use_cache=True):
        self.proxy = proxy.rstrip("/") if proxy else None
        self.api_key = api_key
        self.use_cache = use_cache
        self.request_count = 0
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _cf(self, path):
        key = hashlib.sha1(path.encode()).hexdigest()[:16]
        safe = "".join(c if c.isalnum() else "_" for c in path)[:50].strip("_")
        return CACHE_DIR / f"{safe}__{key}.json"

    def get(self, path):
        f = self._cf(path)
        if self.use_cache and f.exists() and (time.time() - f.stat().st_mtime)/3600 <= CACHE_TTL_H:
            try:
                return json.loads(f.read_text("utf-8"))
            except Exception:
                pass
        url = (f"{self.proxy}?path={urllib.parse.quote(path, safe='/')}"
               if self.proxy else f"{BASE_URL}/{path}")
        req = urllib.request.Request(url, method="GET")
        for k, v in BROWSER_HEADERS.items():
            req.add_header(k, v)
        if self.api_key:
            req.add_header("X-API-Key", self.api_key)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                cs = r.headers.get_content_charset() or "utf-8"
                status, body = r.status, r.read().decode(cs, errors="replace")
        except urllib.error.HTTPError as e:
            status = e.code
            try:
                body = e.read().decode("utf-8", errors="replace")
            except Exception:
                body = ""
        except urllib.error.URLError:
            return None
        self.request_count += 1
        time.sleep(PAUSE)
        if status == 200:
            try:
                data = json.loads(body)
            except ValueError:
                return None
            try:
                f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            except Exception:
                pass
            return data
        return None


# ---- Badge-Definitionen: welche sind Multi-Level? ------------------
def load_multilevel_defs(client):
    """Lädt /badge und ermittelt Multi-Level (points-Array länger als 1)."""
    badges = client.get("badge")
    defs, multi = {}, set()
    if isinstance(badges, list):
        for b in badges:
            bid = b.get("id", "")
            pts = b.get("points", [])
            defs[bid] = {
                "name": b.get("name", bid),
                "points": pts,
                "values": b.get("values", []),
            }
            if isinstance(pts, list) and len(pts) > 1:
                multi.add(bid)
    return defs, multi


# ---- Club-Mitglieder ----------------------------------------------
def club_members(client, club_id):
    data = client.get(f"club/{club_id}") or {}
    members = data.get("user", []) if isinstance(data, dict) else []
    return [(m.get("id"), m.get("name")) for m in members if m.get("id")]


# ---- Flüge eines Piloten bis Stichtag -----------------------------
def user_flights_until(client, uid, end_date):
    """(flight_id, scoring_date) aller Flüge mit scoring_date <= end_date."""
    flights, skip = [], 0
    for _ in range(80):
        params = urllib.parse.urlencode({
            "user_id_in": uid, "order_by": "-scoring_date",
            "not_scored": "false", "limit": FLIGHT_PAGE, "skip": skip})
        data = client.get(f"flight?{params}")
        batch = data if isinstance(data, list) else (data or {}).get("results") if isinstance(data, dict) else None
        if not batch:
            break
        stop = False
        for f in batch:
            if not (isinstance(f, dict) and f.get("id")):
                continue
            d = str(f.get("scoring_date") or f.get("takeoff_time") or "")[:10]
            if d and d <= end_date:
                flights.append((f["id"], d))
            # order ist absteigend -> wenn wir unter den Stichtag rutschen, könnten
            # trotzdem noch neuere kommen? Nein: absteigend => ältere folgen. Aber
            # wir brechen NICHT früh ab, da season-Grenze pro Flug geprüft wird.
        if len(batch) < FLIGHT_PAGE:
            break
        skip += FLIGHT_PAGE
    return flights


def flight_achievements(client, fid):
    d = client.get(f"flightdetail/{fid}")
    if isinstance(d, dict) and isinstance(d.get("achievement"), list):
        return d["achievement"]
    return []


# ---- Stand am Saisonende pro Pilot --------------------------------
def pilot_levels_until(client, uid, end_date, multi):
    """
    Höchstes Multi-Level je badge_id aus Flügen mit scoring_date <= end_date.
    Rückgabe: { badge_id: level }
    """
    flights = user_flights_until(client, uid, end_date)
    levels = {}
    for (fid, fdate) in flights:
        for a in flight_achievements(client, fid):
            bid = a.get("badge_id")
            if not bid or bid not in multi:
                continue
            try:
                lvl = int(a.get("points") or 0)
            except (TypeError, ValueError):
                lvl = 0
            if lvl > levels.get(bid, 0):
                levels[bid] = lvl
    return levels


def main():
    p = argparse.ArgumentParser(description="historical-badges-<jahr>.json erzeugen (aus Flügen).")
    p.add_argument("--season", type=int, required=True,
                   help="Saison, deren ENDE der Stichtag ist (z. B. 2025 -> 30.09.2025)")
    p.add_argument("--club", type=int, default=CLUB_ID)
    p.add_argument("--user", type=int, help="nur ein Pilot (Kontrolle, kein File)")
    p.add_argument("--proxy", metavar="URL")
    p.add_argument("--out", metavar="DATEI", help="Ausgabedatei (Standard historical-badges-<season>.json)")
    p.add_argument("--no-cache", action="store_true")
    args = p.parse_args()

    end_date = f"{args.season}-09-30"
    client = WeGlideClient(proxy=args.proxy,
                           api_key=os.environ.get("WEGLIDE_API_KEY"),
                           use_cache=not args.no_cache)

    print(f"🏅 Historical-Badges-Generator — Stichtag {end_date} (Ende Saison {args.season-1}/{args.season})")
    print("=" * 64)

    print("Lade Badge-Definitionen ...")
    defs, multi = load_multilevel_defs(client)
    print(f"   {len(multi)} Multi-Level-Badges erkannt")
    if not multi:
        print("❌  Keine Multi-Level-Badges gefunden — Abbruch.", file=sys.stderr)
        return 1

    # Pilotenmenge
    if args.user:
        members = [(args.user, None)]
    else:
        members = club_members(client, args.club)
        print(f"   {len(members)} Club-Mitglieder")

    pilots = {}
    for idx, (uid, name) in enumerate(members, 1):
        u = client.get(f"user/{uid}") or {}
        name = name or u.get("name") or f"User {uid}"
        levels = pilot_levels_until(client, uid, end_date, multi)
        if levels:
            pilots[str(uid)] = {"name": name, "badges": levels}
        print(f"  [{idx:>2}/{len(members)}] {name:<26} "
              f"{len(levels)} Multi-Level-Badges   [Requests: {client.request_count}]")

    # Kontrollmodus (ein Pilot): nur anzeigen
    if args.user:
        print(f"\n{'='*64}\n  Stand Ende Saison {args.season-1}/{args.season} — {members[0][0]}")
        pdata = pilots.get(str(args.user), {}).get("badges", {})
        if pdata:
            for bid, lvl in sorted(pdata.items()):
                print(f"    {defs.get(bid,{}).get('name', bid):<24} Level {lvl}")
        else:
            print("    (keine Multi-Level-Badges bis Stichtag)")
        return 0

    # File schreiben
    out = args.out or f"historical-badges-{args.season}.json"
    data = {
        "metadata": {
            "season": f"{args.season-1}/{args.season}",
            "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
            "description": f"Höchste erreichte Multi-Level-Badge-Level bis {end_date} (aus Flügen)",
            "clubId": args.club,
            "clubName": "SG Säntis",
            "multiLevelBadgeCount": len(multi),
            "multiLevelBadges": sorted(multi),
            "source": "flight-history (scoring_date), not created",
        },
        "badgeDefinitions": {bid: defs[bid] for bid in multi if bid in defs},
        "pilots": pilots,
    }
    Path(out).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    total = sum(len(pd["badges"]) for pd in pilots.values())
    print(f"\n{'='*64}")
    print(f"💾 Gespeichert: {out}")
    print(f"   Piloten mit Multi-Level-Badges: {len(pilots)}")
    print(f"   Multi-Level-Badge-Einträge gesamt: {total}")
    print(f"   Requests gesamt: {client.request_count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
