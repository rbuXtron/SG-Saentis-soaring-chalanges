#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
weglide_snapshot_club.py — Saison-Datei + Snapshots eines Clubs
===============================================================
Erzeugt die Dateien, die die SG-Saentis-App liest. Die Saison-Wertung
wird GENAU wie in der App (calculateUserSeasonBadgesWithConfig) gerechnet:

  * Achievements pro ACCOUNT ueber  achievement/user/<uid>
    (NICHT club-gefiltert, NICHT per Flug-Scan -> Copilot-Zuordnung steckt
     schon korrekt in den Account-Achievements).
  * Saison-Zugehoerigkeit: Achievement.created liegt im Saisonfenster
    (<N-1>-10-01 .. <N>-09-30).
  * Saison-Punkte je Badge:
        Multi-Level  -> max(0, aktuelles_Level - Baseline_Vorsaison)
        Single-Level -> 1
    Baseline_Vorsaison = historical-badges-<N-1>.json  (pilots[uid].badges[bid]).
  * badgeCount / seasonBadgeCount = Summe der Saison-Punkte  (Johannes 18, Roman 16)
  * badgeCategoryCount           = Anzahl Saison-Badges       (Johannes 14, Roman 15)
  * allTimeBadgeCount            = Summe aller Level (alle Achievements)

Dateien:
  A)  season-badges-<N>.json        -> Rangliste + Detailansicht (loadPrecomputedBadges)
  A2) badge-rank-snapshots.json     -> ▲/▼-Pfeile (ranking-deltas.js), nur laufende Saison
  B)  badge-history-latest.json + history/<datum>.json
      NUR mit --with-history (Flug-Scan fuer die Level-Verlauf-Timeline mit
      Flug-Links; braucht viele Requests, fuer die Award-Zahlen nicht noetig).

KEINE Abhaengigkeiten (nur urllib). KEIN API-Key ueber den Proxy. Cache aktiv.

Saison 2026 einfrieren:
  python weglide_snapshot_club.py --club 1281 --season-year 2026 \
      --proxy https://sgsaentiscup.vercel.app/api/proxy --out-dir public/data

Taeglich (laufende Saison):
  python weglide_snapshot_club.py --club 1281 \
      --proxy https://sgsaentiscup.vercel.app/api/proxy --out-dir public/data

Einzelpilot-Kontrolle (schreibt nichts):
  python weglide_snapshot_club.py --user 10518 --season-year 2026 --proxy ...
"""
from __future__ import annotations
import argparse, hashlib, json, os, sys, time, datetime, threading
import urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

BASE_URL = "https://api.weglide.org/v1"
CACHE_DIR = Path(os.environ.get("WEGLIDE_CACHE_DIR", ".weglide_cache"))
CACHE_TTL_H = float(os.environ.get("WEGLIDE_CACHE_TTL_H", 168))
TIMEOUT = 30; FLIGHT_PAGE = 100
SG_CLUB_ID = 1281
# Parallelitaet + Robustheit (per Env ueberschreibbar).
MAX_WORKERS = int(os.environ.get("WEGLIDE_WORKERS", 8))   # gleichzeitige Piloten-Abfragen
RETRIES = int(os.environ.get("WEGLIDE_RETRIES", 3))        # Wiederholungen bei 429/5xx/Timeout
BACKOFF = 0.5                                              # Sekunden, exponentiell je Versuch

# Copilot-Badges, die beim OPTIONALEN Flug-Scan fuer BEIDE Insassen zaehlen.
# (Fuer die Saison-Wertung irrelevant - die kommt aus den Account-Achievements.)
COPILOT_BADGES = {"cockpit_crew", "consistency", "flying_spree"}

# Selbstpruefung gegen die geprueften Screenshots:
EXPECTED = {
    "29951": {"name": "Johannes Widmer",       "badgeCount": 18, "categories": 14, "multi": 10, "single": 4},
    "10518": {"name": "Roman Andreas Buehler", "badgeCount": 16, "categories": 15, "multi": 9,  "single": 6},
}

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://weglide.org/", "Origin": "https://weglide.org",
}


# ---------------------------------------------------------------- HTTP-Client
class Client:
    def __init__(s, proxy=None, key=None, cache=True):
        s.proxy = proxy.rstrip("/") if proxy else None
        s.key = key; s.cache = cache; s.n = 0
        s._lock = threading.Lock()   # schuetzt den Request-Zaehler bei Parallelbetrieb
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _cf(s, p):
        k = hashlib.sha1(p.encode()).hexdigest()[:16]
        safe = "".join(c if c.isalnum() else "_" for c in p)[:50].strip("_")
        return CACHE_DIR / f"{safe}__{k}.json"

    def get(s, path, allow_cache=True):
        f = s._cf(path)
        if s.cache and allow_cache and f.exists() and (time.time() - f.stat().st_mtime) / 3600 <= CACHE_TTL_H:
            try:
                return json.loads(f.read_text("utf-8"))
            except Exception:
                pass
        url = f"{s.proxy}?path={urllib.parse.quote(path, safe='/')}" if s.proxy else f"{BASE_URL}/{path}"
        for attempt in range(RETRIES + 1):
            req = urllib.request.Request(url, method="GET")
            for k, v in HEADERS.items():
                req.add_header(k, v)
            if s.key:
                req.add_header("X-API-Key", s.key)
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
                status, body = None, ""
            with s._lock:
                s.n += 1
            if status == 200:
                try:
                    data = json.loads(body)
                except Exception:
                    return None
                try:
                    f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
                except Exception:
                    pass
                return data
            # Transiente Fehler (Rate-Limit/5xx/Timeout) -> kurz warten, erneut versuchen.
            if (status in (429, 500, 502, 503, 504) or status is None) and attempt < RETRIES:
                time.sleep(BACKOFF * (2 ** attempt))
                continue
            return None
        return None


# ---------------------------------------------------------------- Katalog / Baseline / Piloten
def _desc_str(desc):
    if isinstance(desc, dict):
        return desc.get("de") or desc.get("en") or ""
    return desc or ""


def badge_catalog(c):
    """multi = Set der Multi-Level-Badge-IDs; names = id->Name; defs = id->Definition."""
    b = c.get("badge")
    multi, names, defs = set(), {}, {}
    if isinstance(b, list):
        for x in b:
            bid = x.get("id", "")
            if not bid:
                continue
            nm = x.get("name", bid)
            names[bid] = nm
            defs[bid] = {
                "id": bid, "name": nm, "logo": x.get("logo"),
                "description": _desc_str(x.get("description")),
                "values": x.get("values"), "points": x.get("points"),
            }
            if isinstance(x.get("points"), list) and len(x["points"]) > 1:
                multi.add(bid)
    return multi, names, defs


def load_baseline(path):
    """historical-badges-<N-1>.json -> { uid(str): { badge_id: level } }."""
    try:
        d = json.loads(Path(path).read_text("utf-8"))
    except Exception:
        return {}
    out = {}
    for uid, p in (d.get("pilots") or {}).items():
        out[str(uid)] = p.get("badges") or {}
    return out


def pilot_achievements(c, uid):
    """achievement/user/<uid> -> Liste der Account-Achievements (wie die App).
    NIE cachen: Achievements aendern sich, sobald ein Pilot einen Badge holt."""
    d = c.get(f"achievement/user/{uid}", allow_cache=False)
    return d if isinstance(d, list) else []


def club_pilots(c, club):
    ids, names, skip = [], {}, 0
    for _ in range(80):
        q = urllib.parse.urlencode({"club_id_in": club, "order_by": "-scoring_date",
                                    "not_scored": "false", "limit": FLIGHT_PAGE, "skip": skip})
        d = c.get(f"flight?{q}", allow_cache=False)
        batch = d if isinstance(d, list) else ((d or {}).get("results") if isinstance(d, dict) else None)
        if not batch:
            break
        for f in batch:
            u = f.get("user") if isinstance(f, dict) else None
            if isinstance(u, dict) and u.get("id"):
                uid = int(u["id"]); ids.append(uid); names.setdefault(uid, u.get("name"))
        if len(batch) < FLIGHT_PAGE:
            break
        skip += FLIGHT_PAGE
    seen, out = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i); out.append(i)
    return out, names


# ---------------------------------------------------------------- App-Wertung (wie calculateUserSeasonBadgesWithConfig)
def season_of(dstr):
    y, m = int(dstr[:4]), int(dstr[5:7])
    return y + 1 if m >= 10 else y


def season_window(n):
    return (f"{n-1}-10-01", f"{n}-09-30")


def build_app_pilot(uid, name, achievements, base_uid, multi, defs, window):
    """Repliziert die App-Logik 1:1. base_uid = {badge_id: level} der Vorsaison."""
    lo, hi = window
    base_uid = base_uid or {}

    # All-Time: Summe aller Level ueber ALLE Achievements
    alltime = 0
    for a in achievements:
        alltime += (a.get("points") or 1)

    entries = []
    seen_ids = set()
    for a in achievements:
        bid = a.get("badge_id")
        if not bid:
            continue
        created = str(a.get("created") or "")[:10]
        if not created or created < lo or created > hi:
            continue
        if bid in seen_ids:          # ein Eintrag pro Badge (hoechstes Level)
            continue
        seen_ids.add(bid)

        d = a.get("badge") or defs.get(bid) or {}
        vals = d.get("values")
        is_multi = (bid in multi) or (isinstance(d.get("points"), list) and len(d["points"]) > 1)

        cur = a.get("points")
        if not cur:
            cur = (len(vals) if isinstance(vals, list) else 0) or 1
        if is_multi:
            pre = base_uid.get(bid, 0) or 0
            pts = max(0, cur - pre)
            detail = f"Level {pre}→{cur}"
        else:
            pre = 0
            pts = 1
            detail = "Badge erreicht"

        name_b = d.get("name") or bid
        desc = _desc_str(d.get("description"))
        logo = d.get("logo")
        entries.append({
            "badge_id": bid, "name": name_b, "description": desc, "logo": logo,
            "level": cur, "points": pts, "seasonPoints": pts,
            "type": "multi-level" if is_multi else "single-level",
            "detail": detail, "value": a.get("value"),
            "flight_id": a.get("flight_id"), "achieved_at": created,
            "badge": {"id": bid, "name": name_b, "logo": logo, "description": desc,
                      "values": vals, "points": d.get("points")},
        })

    season_pts = sum(e["points"] for e in entries)   # badgeCount
    cats = len(entries)                              # badgeCategoryCount
    mlc = sum(1 for e in entries if e["type"] == "multi-level")
    slc = cats - mlc
    fwb = len({e["flight_id"] for e in entries if e.get("flight_id")})

    return {
        "userId": uid, "userName": name,
        "badges": entries, "seasonBadges": entries,
        "seasonBadgeCount": season_pts, "badgeCount": season_pts,
        "badgeCategoryCount": cats, "allTimeBadgeCount": alltime,
        "multiLevelCount": mlc, "singleLevelCount": slc,
        "flightsWithBadges": fwb, "flightsAnalyzed": 0,
    }


def selfcheck(app_pilots):
    print("\n🔎 Selbstpruefung gegen bekannte Soll-Staende:")
    problems = 0
    for uid, exp in EXPECTED.items():
        p = app_pilots.get(uid)
        if not p:
            print(f"  ⚠️ {exp['name']} ({uid}) nicht gefunden"); problems += 1; continue
        checks = [("badgeCount", p["badgeCount"], exp["badgeCount"]),
                  ("Kategorien", p["badgeCategoryCount"], exp["categories"]),
                  ("Multi", p["multiLevelCount"], exp["multi"]),
                  ("Single", p["singleLevelCount"], exp["single"])]
        print(f"  — {p['userName']} ({uid}):")
        for label, got, want in checks:
            ok = got == want
            if not ok:
                problems += 1
            print(f"      {'✅' if ok else '❌'} {label}: {got} (erwartet {want})")
    print("✅ Selbstpruefung bestanden." if problems == 0
          else f"⚠️ {problems} Abweichung(en) – stimmt die Baseline-Datei? ggf. --no-cache.")
    return problems


# ---------------------------------------------------------------- OPTIONAL: Flug-Scan (Level-Verlauf-Timeline)
def flights_by(c, role, uid):
    out, skip = [], 0
    for _ in range(80):
        q = urllib.parse.urlencode({role: uid, "order_by": "-scoring_date",
                                    "not_scored": "false", "limit": FLIGHT_PAGE, "skip": skip})
        d = c.get(f"flight?{q}", allow_cache=False)
        batch = d if isinstance(d, list) else ((d or {}).get("results") if isinstance(d, dict) else None)
        if not batch:
            break
        for f in batch:
            if isinstance(f, dict) and f.get("id"):
                out.append((f["id"], str(f.get("scoring_date") or f.get("takeoff_time") or "")[:10]))
        if len(batch) < FLIGHT_PAGE:
            break
        skip += FLIGHT_PAGE
    return out


def all_flights(c, uid):
    seen, out = set(), []
    for role in ("user_id_in", "co_user_id_in"):
        for fid, fdate in flights_by(c, role, uid):
            if fid not in seen:
                seen.add(fid); out.append((fid, fdate))
    out.sort(key=lambda x: (x[1] or "", x[0]))
    return out


def reconstruct(flights, multi, uid):
    running, hist = {}, {}
    for fid, fdate, achs in flights:
        for a in achs:
            bid = a.get("badge_id")
            if not bid:
                continue
            a_uid = a.get("user_id")
            if bid not in COPILOT_BADGES and a_uid is not None and uid is not None and int(a_uid) != int(uid):
                continue
            try:
                lvl = int(a.get("level") or 0)
            except Exception:
                lvl = 0
            if lvl <= 0:
                lvl = 1
            prev = running.get(bid, 0)
            if lvl > prev:
                lst = hist.setdefault(bid, [])
                for L in range(prev + 1, lvl + 1):
                    lst.append([L, fdate, fid])
                running[bid] = lvl
    out = {}
    for bid, lst in hist.items():
        out[bid] = {"kind": "multi" if bid in multi else "single",
                    "level": running.get(bid, 1), "history": lst}
    return out


def pilot_flightscan(c, uid, multi):
    flights = []
    for fid, fdate in all_flights(c, uid):
        if not fdate:
            continue
        d = c.get(f"flightdetail/{fid}")
        if not isinstance(d, dict):
            continue
        if (d.get("club") or {}).get("id") != SG_CLUB_ID:
            continue
        achs = [{"badge_id": a.get("badge_id"), "level": a.get("points"), "user_id": a.get("user_id")}
                for a in (d.get("achievement") or [])]
        flights.append((fid, fdate, achs))
    flights.sort(key=lambda x: (x[1] or "", x[0]))
    return reconstruct(flights, multi, uid)


def season_points_1pt(badges, window):
    lo, hi = window
    hit = [bid for bid, b in badges.items() if any(lo <= e[1] <= hi for e in b["history"])]
    return len(hit), sorted(hit)


# ---------------------------------------------------------------- Cup-Wertung (wie data-processor.js)
# Flugzeugfaktor = (100 / DMST-Index)^2 ; Werte 1:1 aus public/config/constants.js
AIRCRAFT_DMST_INDEX = {
    "JS1-21": 126, "JS1C 21m": 126, "ASH 25E": 122, "HpH 304 MS Shark": 119,
    "LS 9": 117, "LS 6": 117, "DG 800": 118, "Discus 2cT 18m": 114, "Duo Discus": 112,
    "DG 400": 109, "DG 300 WL": 105, "DG 300": 104, "DG 500": 104, "DG 500 20m": 104,
    "DG 1000S 18m": 106, "Libelle": 96, "MG 23": 76, "HpH 304 CZ": 119, "Mg 19": 77,
    "Arcus T": 120, "ASH 25 M": 122, "JS1C TJ 21m": 126, "Nimbus 2c": 114, "JS2 21m": 126,
    "MDM-1 Fox": 72, "Discus 2b": 108, "K 8": 76,
}
_AIRCRAFT_F2 = {k: (100.0 / v) ** 2 for k, v in AIRCRAFT_DMST_INDEX.items()}

AIRFIELD_FACTORS = {"St Gallen-Altenrhein": 1.0}  # Homebase; alles andere 0.8

FLIGHT_INSTRUCTORS = {
    "Guido Halter": 1.2, "Kurt Sauter": 2.0, "Werner Rissi": 1.4, "Heinz Bärfuss": 1.2,
    "Roman Bühler": 1.2, "Roman Andreas Buehler": 1.2, "Roger Larpin": 2, "Sg Saentis": 1.0,
    "Sg Santis": 1.0, "Juerg Weiss": 2, "Heinz Brem": 2,
}


def load_exclusions(path):
    """excluded-pilots.json -> {userId: excludeFromSeason}. Ohne Feld: 0 (=immer)."""
    try:
        d = json.loads(Path(path).read_text("utf-8"))
    except Exception:
        return {}
    out = {}
    for e in (d.get("pilots") or []):
        # Zwei Formate erlaubt:
        #   "123"  / 123                -> ab allen Saisons ausgeschlossen
        #   {"userId": 123, "excludeFromSeason": 2026}
        if isinstance(e, (str, int)):
            try:
                out[int(e)] = 0
            except (TypeError, ValueError):
                continue
            continue
        if not isinstance(e, dict):
            continue
        uid = e.get("userId")
        if uid is None:
            continue
        try:
            out[int(uid)] = int(e.get("excludeFromSeason")) if e.get("excludeFromSeason") is not None else 0
        except (TypeError, ValueError):
            continue
    return out


def aircraft_factor(name):
    """Repliziert getAircraftFactor: exakt -> case-insensitiv -> partiell -> 1.0."""
    if not name:
        return 1.0
    n = name.strip()
    if n in _AIRCRAFT_F2:
        return _AIRCRAFT_F2[n]
    nu = n.upper()
    for k, v in _AIRCRAFT_F2.items():
        if k.upper() == nu:
            return v
    for k, v in _AIRCRAFT_F2.items():
        if n in k or k in n:
            return v
    return 1.0


def airfield_factor(name):
    return AIRFIELD_FACTORS.get((name or "").strip(), 0.8)


def pilot_tier(km):
    for maxkm, fac in ((50, 4.0), (100, 3.0), (300, 2.0), (500, 1.6), (700, 1.4), (1000, 1.2)):
        if km <= maxkm:
            return fac
    return 1.0


def load_pilot_factors(path):
    """pilot-factors-<N-1>.json -> {name: {factor, bestDistance}} (Vorsaison-Basislinie)."""
    try:
        d = json.loads(Path(path).read_text("utf-8"))
    except Exception:
        return {}
    out = {}
    for p in (d.get("pilots") or {}).values():
        nm = p.get("name")
        if nm:
            out[nm] = {"factor": p.get("factor", 4.0), "bestDistance": p.get("bestDistance", 0) or 0}
    return out


def season_flights_points(c, uid, window):
    """Flugliste eines Piloten in der Saison -> [{date, km, aircraft, takeoff, copilot}]."""
    lo, hi = window
    out, skip = [], 0
    for _ in range(80):
        q = urllib.parse.urlencode({"user_id_in": uid, "order_by": "-scoring_date",
                                    "not_scored": "false", "limit": FLIGHT_PAGE, "skip": skip})
        d = c.get(f"flight?{q}", allow_cache=False)
        batch = d if isinstance(d, list) else ((d or {}).get("results") if isinstance(d, dict) else None)
        if not batch:
            break
        stop = False
        for f in batch:
            if not isinstance(f, dict):
                continue
            date = str(f.get("scoring_date") or f.get("takeoff_time") or "")[:10]
            if not date:
                continue
            if date < lo:            # nach -scoring_date sortiert -> danach nur noch aeltere
                stop = True
                continue
            if date > hi:
                continue
            contest = f.get("contest") or {}
            co = f.get("co_user")
            coname = (co.get("name") if isinstance(co, dict) else (co if isinstance(co, str) else None)) or f.get("co_user_name")
            out.append({
                "date": date,
                "km": float(contest.get("distance") or 0),
                "aircraft": ((f.get("aircraft") or {}).get("name")) or "Unbekannt",
                "takeoff": ((f.get("takeoff_airport") or {}).get("name")) or "Unbekannt",
                "copilot": coname,
            })
        if stop or len(batch) < FLIGHT_PAGE:
            break
        skip += FLIGHT_PAGE
    return out


def season_flights_full(c, uid, name, window):
    """Volle Flugliste eines Piloten in der Saison (Rohfelder fuer die App)."""
    lo, hi = window
    out, skip = [], 0
    for _ in range(80):
        q = urllib.parse.urlencode({"user_id_in": uid, "order_by": "-scoring_date",
                                    "not_scored": "false", "limit": FLIGHT_PAGE, "skip": skip})
        d = c.get(f"flight?{q}", allow_cache=False)
        batch = d if isinstance(d, list) else ((d or {}).get("results") if isinstance(d, dict) else None)
        if not batch:
            break
        stop = False
        for f in batch:
            if not isinstance(f, dict):
                continue
            date = str(f.get("scoring_date") or f.get("takeoff_time") or "")[:10]
            if not date:
                continue
            if date < lo:
                stop = True
                continue
            if date > hi:
                continue
            contest = f.get("contest") or {}
            co = f.get("co_user")
            out.append({
                "id": f.get("id"),
                "scoring_date": f.get("scoring_date"),
                "takeoff_time": f.get("takeoff_time"),
                "landing_time": f.get("landing_time"),
                "contest": {"distance": contest.get("distance"), "speed": contest.get("speed"), "points": contest.get("points")},
                "aircraft": {"name": (f.get("aircraft") or {}).get("name")},
                "takeoff_airport": {"name": (f.get("takeoff_airport") or {}).get("name")},
                "co_user": ({"name": co.get("name")} if isinstance(co, dict) else ({"name": co} if isinstance(co, str) else None)),
                "story": f.get("story") or [],
                "user": {"id": uid, "name": name},
            })
        if stop or len(batch) < FLIGHT_PAGE:
            break
        skip += FLIGHT_PAGE
    return out


def cup_total_points(flights, name, hist_factors):
    """Gesamtpunkte = Summe der 3 besten Flüge (km x P-Faktor x Flz-Faktor x Platzfaktor).
    Pilotenfaktor chronologisch mit 'nie verschlechtern'-Übernahme (wie data-processor.js)."""
    hf = hist_factors.get(name) or {}
    current = hf.get("factor", 4.0)
    best = hf.get("bestDistance", 0) or 0
    pts = []
    for f in sorted(flights, key=lambda x: x["date"]):
        instr = FLIGHT_INSTRUCTORS.get(f["copilot"]) if f.get("copilot") else None
        pf = instr if instr is not None else current
        if instr is None and f["km"] > best:
            best = f["km"]
            nf = pilot_tier(f["km"])
            if nf < current:       # nur verbessern (senken), nie verschlechtern
                current = nf
        pts.append(f["km"] * pf * aircraft_factor(f["aircraft"]) * airfield_factor(f["takeoff"]))
    pts.sort(reverse=True)
    return sum(pts[:3])


def compute_ranks(pilots):
    order = sorted(pilots.items(),
                   key=lambda kv: (-kv[1]["season_points"], (kv[1]["name"] or "").lower()))
    for i, (uid, p) in enumerate(order, 1):
        p["rank"] = i


def apply_movement(pilots, prev_path):
    try:
        prev = json.loads(Path(prev_path).read_text("utf-8")).get("pilots", {})
    except Exception:
        prev = {}
    for uid, p in pilots.items():
        pr = prev.get(uid, {}).get("rank")
        p["rank_prev"] = pr
        p["delta"] = (pr - p["rank"]) if isinstance(pr, int) else 0


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Saison-Datei + Snapshots eines Clubs (App-konform).")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--club", type=int)
    src.add_argument("--user", type=int)
    ap.add_argument("--proxy")
    ap.add_argument("--out-dir", default="public/data")
    ap.add_argument("--baseline", default=None,
                    help="historical-badges-<N-1>.json (Default: <out-dir>/historical-badges-<N-1>.json)")
    ap.add_argument("--date", default=None)
    ap.add_argument("--season-year", type=int, default=None)
    ap.add_argument("--no-season-file", action="store_true")
    ap.add_argument("--with-history", action="store_true",
                    help="zusaetzlich badge-history-latest.json via Flug-Scan (langsam).")
    ap.add_argument("--no-cache", action="store_true")
    a = ap.parse_args()

    today = a.date or datetime.date.today().isoformat()
    season = a.season_year or season_of(today)
    window = season_window(season)
    c = Client(a.proxy, os.environ.get("WEGLIDE_API_KEY"), not a.no_cache)

    baseline_path = a.baseline or (Path(a.out_dir) / f"historical-badges-{season-1}.json")
    base = load_baseline(baseline_path)
    print(f"Saison {season-1}/{season}  ·  Fenster {window[0]} – {window[1]}")
    print(f"Baseline: {baseline_path}  ({len(base)} Piloten)")

    multi, names, defs = badge_catalog(c)
    print(f"{len(multi)} Multi-Level-Badges im Katalog, {len(defs)} Definitionen")

    if a.user:
        pilots_ids, pnames = [a.user], {}
    else:
        pilots_ids, pnames = club_pilots(c, a.club)
        print(f"{len(pilots_ids)} Piloten im Club")
        excl = load_exclusions(Path(a.out_dir) / "excluded-pilots.json")
        if excl:
            before = len(pilots_ids)
            pilots_ids = [u for u in pilots_ids if not (u in excl and season >= excl[u])]
            if before != len(pilots_ids):
                print(f"🚫 {before - len(pilots_ids)} Pilot(en) ausgeschlossen (Saison {season})")

    app_pilots = {}
    levels = {}        # Light-Level-Snapshot: uid -> {name, b:{bid:[level,flight_id,created]}}

    def _load_pilot(uid):
        """Ein Pilot: Achievements holen, App-Pilot bauen, Light-Level ableiten."""
        ach = pilot_achievements(c, uid)
        name = pnames.get(uid)
        if not name:                                   # Name fehlt -> erst dann user/<uid>
            name = (c.get(f"user/{uid}") or {}).get("name") or f"User {uid}"
        ap_p = build_app_pilot(uid, name, ach, base.get(str(uid)), multi, defs, window)
        lv = {}
        for a2 in ach:
            bid = a2.get("badge_id")
            if not bid:
                continue
            try:
                L = int(a2.get("points") or 1)
            except Exception:
                L = 1
            cur = lv.get(bid)
            if cur is None or L > cur[0]:
                lv[bid] = [L, a2.get("flight_id"), str(a2.get("created") or "")[:10]]
        return uid, name, ap_p, lv

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = {ex.submit(_load_pilot, uid): uid for uid in pilots_ids}
        for i, fut in enumerate(as_completed(futs), 1):
            uid, name, ap_p, lv = fut.result()
            app_pilots[str(uid)] = ap_p
            levels[str(uid)] = {"name": name, "b": lv}
            print(f"  [{i:>2}/{len(pilots_ids)}] {name:<26} "
                  f"badgeCount={ap_p['badgeCount']:>2}  Kat={ap_p['badgeCategoryCount']:>2}  "
                  f"Gesamt={ap_p['allTimeBadgeCount']:>3}  [Req:{c.n}]")

    if a.user:
        p = app_pilots[str(a.user)]
        print(f"\n{p['userName']}  badgeCount={p['badgeCount']}  Kategorien={p['badgeCategoryCount']}  "
              f"(Multi {p['multiLevelCount']} / Single {p['singleLevelCount']})  Gesamt={p['allTimeBadgeCount']}")
        for e in sorted(p["badges"], key=lambda x: (x["type"], -x["points"], x["name"])):
            print(f"   {e['name']:<22} {e['type']:<12} L{e['level']}  +{e['points']}  {e['detail']}")
        return 0

    outdir = Path(a.out_dir); outdir.mkdir(parents=True, exist_ok=True)
    if season == 2026:
        problems = selfcheck(app_pilots)
    else:
        problems = 0
        print(f"\nℹ️ Selbstpruefung ist nur fuer Saison 2026 (Johannes/Roman) hinterlegt — "
              f"fuer Saison {season-1}/{season} uebersprungen.")

    # ---- A) season-badges-<N>.json ----
    if not a.no_season_file:
        season_doc = {
            "season": season, "season_label": f"{season-1}/{season}",
            "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M"),
            "pilots": app_pilots,
        }
        sf = outdir / f"season-badges-{season}.json"
        sf.write_text(json.dumps(season_doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"💾 {sf}   ({len(app_pilots)} Piloten)")

    # ---- A2) badge-rank-snapshots.json (nur laufende Saison) ----
    if season == season_of(datetime.date.today().isoformat()):
        order = sorted(app_pilots.items(),
                       key=lambda kv: (-kv[1]["badgeCount"], (kv[1]["userName"] or "").lower()))
        ranks_by_name = {}
        rank = 0
        for uid, p in order:
            if p["badgeCount"] > 0:
                rank += 1; ranks_by_name[p["userName"]] = rank
        snap_path = outdir / "badge-rank-snapshots.json"
        try:
            arr = json.loads(snap_path.read_text("utf-8"))
            if not isinstance(arr, list):
                arr = []
        except Exception:
            arr = []
        arr = [s for s in arr if str(s.get("t", ""))[:10] != today]
        arr.append({"t": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "ranks": ranks_by_name})
        arr = arr[-60:]
        snap_path.write_text(json.dumps(arr, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"💾 {snap_path}   ({len(ranks_by_name)} Piloten, {len(arr)} Snapshots)")

    # ---- A2b) Cup-Flüge vorberechnen + Punkte (season-flights, Ränge, season-points) ----
    pf_path = outdir / f"pilot-factors-{season-1}.json"
    hist_factors = load_pilot_factors(pf_path)
    print(f"Cup-Punkte: Pilotenfaktoren aus {pf_path.name} ({len(hist_factors)} Piloten)")
    flights_all = []
    totals = {}
    pts_by_uid = {}

    def _load_flights(uid):
        nm = app_pilots[str(uid)]["userName"]
        return uid, nm, season_flights_full(c, uid, nm, window)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = {ex.submit(_load_flights, uid): uid for uid in pilots_ids}
        for fut in as_completed(futs):
            uid, nm, ff = fut.result()
            flights_all.extend(ff)
            simple = [{
                "date": str(f.get("scoring_date") or f.get("takeoff_time") or "")[:10],
                "km": float((f.get("contest") or {}).get("distance") or 0),
                "aircraft": (f.get("aircraft") or {}).get("name") or "Unbekannt",
                "takeoff": (f.get("takeoff_airport") or {}).get("name") or "Unbekannt",
                "copilot": (f.get("co_user") or {}).get("name") if f.get("co_user") else None,
            } for f in ff]
            tp = cup_total_points(simple, nm, hist_factors)
            if tp > 0:
                totals[nm] = tp
                pts_by_uid[str(uid)] = {"name": nm, "points": round(tp, 2)}

    # season-flights-<N>.json: Rohfluege fuer schnelles Laden in der App
    if not a.no_season_file:
        ff_doc = {"season": season, "season_label": f"{season-1}/{season}",
                  "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M"),
                  "flights": flights_all}
        ff_path = outdir / f"season-flights-{season}.json"
        ff_path.write_text(json.dumps(ff_doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"💾 {ff_path}   ({len(flights_all)} Fluege)")

    # ---- Cup-Bewegungs-Snapshots (points-rank-snapshots: ▲▼, nur laufende Saison) ----
    if season == season_of(datetime.date.today().isoformat()):
        order = sorted(totals.items(), key=lambda kv: (-kv[1], (kv[0] or "").lower()))
        ranks_by_name = {nm: i for i, (nm, _tp) in enumerate(order, 1)}
        snap_path = outdir / "points-rank-snapshots.json"
        try:
            arr = json.loads(snap_path.read_text("utf-8"))
            if not isinstance(arr, list):
                arr = []
        except Exception:
            arr = []
        arr = [s for s in arr if str(s.get("t", ""))[:10] != today]
        arr.append({"t": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "ranks": ranks_by_name})
        arr = arr[-60:]
        snap_path.write_text(json.dumps(arr, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"💾 {snap_path}   ({len(ranks_by_name)} Piloten, {len(arr)} Snapshots)")

    # ---- season-points-<N>.json: Cup-Endpunkte pro Pilot (JEDE Saison) ----
    # -> dient in "Mein Jahr" der naechsten Saison als Vorsaison-Vergleich.
    if not a.no_season_file:
        sp_doc = {
            "season": season, "season_label": f"{season-1}/{season}",
            "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M"),
            "pilots": pts_by_uid,
        }
        sp_path = outdir / f"season-points-{season}.json"
        sp_path.write_text(json.dumps(sp_doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"💾 {sp_path}   ({len(pts_by_uid)} Piloten)")

    # ---- A3) Taeglicher Light-Level-Snapshot (fuer den Verlauf-Builder) ----
    lvdir = outdir / "badge-levels"; lvdir.mkdir(parents=True, exist_ok=True)
    (lvdir / f"{today}.json").write_text(
        json.dumps({"date": today, "pilots": levels}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"💾 {lvdir / (today + '.json')}   (Light-Level-Snapshot, {len(levels)} Piloten)")

    # ---- B) OPTIONAL Flug-Scan Backfill (einmalig, langsam) ----
    # Erzeugt den VOLLEN Level-Verlauf (auch Alt-Stufen vor Aufzeichnung) als
    # badge-history-backfill.json. build_badge_history.py nimmt den als Seed und
    # ergaenzt ihn mit den taeglichen Light-Snapshots -> badge-history-latest.json.
    if a.with_history:
        print("\n⏳ Flug-Scan Backfill (einmalig, langsam – ein Request pro Flug) …")
        pilots = {}
        for i, uid in enumerate(pilots_ids, 1):
            badges = pilot_flightscan(c, uid, multi)
            pilots[str(uid)] = {"name": app_pilots[str(uid)]["userName"], "badges": badges}
            print(f"  [hist {i:>2}/{len(pilots_ids)}] {app_pilots[str(uid)]['userName']:<26} "
                  f"{len(badges)} Badges  [Req:{c.n}]")
        doc = {"generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "date": today, "source": "flight-scan", "pilots": pilots}
        (outdir / "badge-history-backfill.json").write_text(
            json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"💾 {outdir / 'badge-history-backfill.json'}   "
              f"(einmaliger Backfill; jetzt build_badge_history.py laufen lassen)")

    print(f"\nRequests gesamt: {c.n}")
    return 0 if problems == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
