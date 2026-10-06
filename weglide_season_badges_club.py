#!/usr/bin/env python3
"""
weglide_season_badges_club.py — Saison-Badge-Wertung (File-Abzug)
=================================================================

Berechnet die in einer SAISON erreichten Badge-Punkte pro Pilot.

Regel (mit Roman final festgelegt):
  Saison N = 1.10.(N-1) .. 30.9.(N).
  • Nur die Flüge der angefragten Saison werden geladen (season_in=N).
  • MULTI-LEVEL-Badges:
        seasonPoints = max(0, höchstes Level in Saison-N-Flügen
                              − Level aus File historical-badges-(N-1).json)
    'points' pro Flug ist NICHT kumulativ -> Maximum über die Flüge nehmen.
    Der Vorsaison-Abzug kommt aus dem FILE (Autorität), nicht aus Altflügen
    (die für alte Badges fehlen können).
  • SINGLE-LEVEL-Badges (inkl. flug-lose wie first_step):
        zählen, wenn 'created' (Achievement-Liste) in Saison N liegt. +points.
    Bei Single-Level ist 'created' zuverlässig (der created-Bug betrifft nur
    Multi-Level).

KEINE ABHÄNGIGKEITEN (nur urllib). KEIN API-Key über den Proxy.
Requests: Saison-Flüge (flightdetail) + 1x Achievement-Liste pro Pilot.
Cache aktiv (.weglide_cache/, 7 Tage).

Pilotenquelle (eine wählen):
  --club 1281 | --users-file ids.txt | --users 9604 29951 | --user 9604

Beispiele:
  python weglide_season_badges_club.py --user 9604 --season 2025 --detail \
      --hist-dir public/data --proxy https://sgsaentiscup.vercel.app/api/proxy
  python weglide_season_badges_club.py --club 1281 --season 2025 \
      --hist-dir public/data --proxy https://sgsaentiscup.vercel.app/api/proxy \
      --csv saison2025.csv
"""

from __future__ import annotations

import argparse
import csv as csvmod
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_URL    = "https://api.weglide.org/v1"
CACHE_DIR   = Path(os.environ.get("WEGLIDE_CACHE_DIR", ".weglide_cache"))
CACHE_TTL_H = float(os.environ.get("WEGLIDE_CACHE_TTL_H", 168))
TIMEOUT     = 30
PAUSE       = 0.25
FLIGHT_PAGE = 100

# Copilot-Badges: zählen für BEIDE Insassen eines Doppelsitzers,
# unabhängig von der user_id im Badge-Eintrag.
# Multi-Level-Badges, die fuer BEIDE Doppelsitzer-Insassen zaehlen:
COPILOT_BADGES = {"cockpit_crew", "always_by_your_side", "consistency"}
# Single-Level-Badges, die fuer BEIDE zaehlen (Pilot oder Copilot):
COPILOT_SINGLE_BADGES = {"flying_spree"}

# Nur Badges aus Flügen dieses Clubs zählen (SG Säntis).
SG_CLUB_ID = 1281

BROWSER_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/120.0.0.0 Safari/537.36"),
    "Referer": "https://weglide.org/",
    "Origin": "https://weglide.org",
}


# ---- Saison-Logik --------------------------------------------------
def season_of(iso) -> int | None:
    if not iso or len(str(iso)) < 7:
        return None
    s = str(iso)
    return int(s[:4]) + 1 if int(s[5:7]) >= 10 else int(s[:4])


def season_label(n: int) -> str:
    return f"{n-1}/{n}"


# ---- HTTP-Client mit Cache ----------------------------------------
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


# ---- Multi-Level-Definitionen -------------------------------------
def load_multilevel_ids(client):
    badges = client.get("badge")
    multi, names, defs = set(), {}, {}
    if isinstance(badges, list):
        for b in badges:
            bid = b.get("id", "")
            names[bid] = b.get("name", bid)
            desc = b.get("description")
            if isinstance(desc, dict):
                desc = desc.get("de") or desc.get("en") or ""
            defs[bid] = {
                "id": bid,
                "name": b.get("name", bid),
                "logo": b.get("logo", ""),
                "description": desc or "",
                "values": b.get("values", []),
                "points": b.get("points", []),
            }
            pts = b.get("points", [])
            if isinstance(pts, list) and len(pts) > 1:
                multi.add(bid)
    return multi, names, defs


# ---- Vorsaison-File lesen -----------------------------------------
def find_hist_file(season_prev, hist_dir):
    fname = f"historical-badges-{season_prev}.json"
    candidates = []
    if hist_dir:
        candidates.append(Path(hist_dir) / fname)
    candidates += [Path(fname), Path("public/data") / fname, Path("data") / fname]
    for c in candidates:
        if c.exists():
            return c
    return None


def load_prev_levels(season_prev, hist_dir):
    """{ userId(str): {badge_id: level} } aus dem Vorsaison-File, oder leer."""
    path = find_hist_file(season_prev, hist_dir)
    if not path:
        print(f"⚠️   Vorsaison-File historical-badges-{season_prev}.json NICHT gefunden "
              f"— Abzug = 0 für alle (nur korrekt, wenn niemand Vorgeschichte hat).")
        return {}, None
    try:
        data = json.loads(path.read_text("utf-8"))
    except Exception as e:
        print(f"⚠️   Vorsaison-File nicht lesbar: {e}")
        return {}, None
    pilots = data.get("pilots", {}) if isinstance(data, dict) else {}
    out = {}
    for uid, pd in pilots.items():
        out[str(uid)] = pd.get("badges", {}) if isinstance(pd, dict) else {}
    print(f"📂 Vorsaison-Abzug aus: {path}  ({len(out)} Piloten)")
    return out, path


# ---- Pilotenquellen ------------------------------------------------
def uniq(seq):
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x); out.append(x)
    return out


def parse_ids_file(path):
    text = Path(path).read_text("utf-8").strip()
    if text.startswith("["):
        try:
            return uniq(int(x) for x in json.loads(text))
        except Exception:
            pass
    ids = []
    for chunk in text.replace(",", "\n").splitlines():
        d = "".join(c for c in chunk if c.isdigit())
        if d:
            ids.append(int(d))
    return uniq(ids)


def enumerate_club_pilots(client, club_id):
    print(f"🔎 Ermittle Piloten des Clubs {club_id} aus den Flügen ...")
    ids, names, skip = [], {}, 0
    for _ in range(60):
        params = urllib.parse.urlencode({
            "club_id_in": club_id, "order_by": "-scoring_date",
            "not_scored": "false", "limit": FLIGHT_PAGE, "skip": skip})
        data = client.get(f"flight?{params}")
        batch = data if isinstance(data, list) else (data or {}).get("results") if isinstance(data, dict) else None
        if not batch:
            break
        for f in batch:
            u = f.get("user") if isinstance(f, dict) else None
            if isinstance(u, dict) and u.get("id"):
                ids.append(int(u["id"])); names.setdefault(int(u["id"]), u.get("name"))
        if len(batch) < FLIGHT_PAGE:
            break
        skip += FLIGHT_PAGE
    print(f"   → {len(uniq(ids))} Piloten")
    return uniq(ids), names


# ---- Saison-Flüge (nur diese Saison) -------------------------------
def _season_flights_by(client, param, uid, season):
    ids, skip = [], 0
    for _ in range(40):
        params = urllib.parse.urlencode({
            param: uid, "season_in": season, "order_by": "-scoring_date",
            "not_scored": "false", "limit": FLIGHT_PAGE, "skip": skip})
        data = client.get(f"flight?{params}")
        batch = data if isinstance(data, list) else (data or {}).get("results") if isinstance(data, dict) else None
        if not batch:
            break
        for f in batch:
            if isinstance(f, dict) and f.get("id"):
                ids.append(f["id"])
        if len(batch) < FLIGHT_PAGE:
            break
        skip += FLIGHT_PAGE
    return ids

def season_flights(client, uid, season):
    """Saison-Flüge des Piloten als PIC UND als Copilot, dedupliziert."""
    seen = []
    known = set()
    for fid in (_season_flights_by(client, "user_id_in", uid, season)
                + _season_flights_by(client, "co_user_id_in", uid, season)):
        if fid not in known:
            known.add(fid); seen.append(fid)
    return seen


def flight_detail(client, fid):
    """Voll-Detail eines Flugs (gecacht via client.get)."""
    d = client.get(f"flightdetail/{fid}")
    return d if isinstance(d, dict) else None


def flight_club_id(client, fid):
    d = flight_detail(client, fid)
    return (d.get("club") or {}).get("id") if d else None


def flight_achievements(client, fid):
    d = client.get(f"flightdetail/{fid}")
    if isinstance(d, dict) and isinstance(d.get("achievement"), list):
        return d["achievement"]
    return []


def load_achievements(client, uid):
    raw = client.get(f"achievement/user/{uid}")
    return raw if isinstance(raw, list) else []


# ---- Kernberechnung pro Pilot --------------------------------------
def compute_pilot(client, uid, season, multi, badge_names, prev_levels, cur_levels):
    prev = prev_levels.get(str(uid), {})
    cur = cur_levels.get(str(uid), {})

    # 1) Multi-Level: höchstes Level je Badge aus den SAISON-Flügen
    #    user_id-Filter: ein Badge zählt nur für den ausgewerteten Piloten;
    #    Ausnahme Copilot-Badges (always_by_your_side, consistency) -> für beide.
    # Copilot-Single-Badges (flying_spree) aus den Saison-Flügen einsammeln
    # (zählen für beide Insassen; club SG genügt, kein user_id-Filter).
    copilot_single_found = set()
    for fid in season_flights(client, uid, season):
        d = flight_detail(client, fid)
        if not d:
            continue
        if (d.get("club") or {}).get("id") != SG_CLUB_ID:
            continue
        for a in (d.get("achievement") or []):
            if a.get("badge_id") in COPILOT_SINGLE_BADGES:
                copilot_single_found.add(a.get("badge_id"))

    # 1) Multi-Level: 1 PUNKT pro Badge, dessen Level in der Saison gestiegen ist
    #    (Ende-Saison-Level > Vorsaison-Level) — egal um wie viele Stufen.
    rows = []
    for bid in sorted(set(cur) | set(prev)):
        if bid not in multi:
            continue
        cur_lvl = int(cur.get(bid, 0) or 0)
        prev_lvl = int(prev.get(bid, 0) or 0)
        if cur_lvl > prev_lvl:
            rows.append({"badge_id": bid, "name": badge_names.get(bid, bid),
                         "kind": "multi", "season_points": 1,
                         "detail": f"Level {prev_lvl}→{cur_lvl} (+1)"})

    # 2) Single-Level: Saison-Zuordnung über das FLUGDATUM (scoring_date), NICHT
    #    über 'created' (das ist die letzte Änderung und kann in der falschen
    #    Saison liegen). Flug-gebundene nur wenn Flug-club = SG.
    #    Flug-lose (flight_id None, z. B. first_step) fallen über 'created' zurück.
    for a in load_achievements(client, uid):
        bid = a.get("badge_id")
        if not bid or bid in multi:
            continue
        fid = a.get("flight_id")
        flless = fid is None
        if flless:
            # kein Flug -> nur created als Saison-Anhalt
            if season_of(a.get("created")) != season:
                continue
            detail = "created " + str(a.get("created"))[:10] + " (flug-los)"
        else:
            d = flight_detail(client, fid)
            if not d:
                continue
            if (d.get("club") or {}).get("id") != SG_CLUB_ID:
                continue  # Flug bei anderem Club -> nicht werten
            fdate = str(d.get("scoring_date") or d.get("takeoff_time") or "")[:10]
            if season_of(fdate) != season:
                continue  # Flug liegt in einer anderen Saison
            detail = "Flug " + fdate
        try:
            pts = int(a.get("points") or 1)
        except (TypeError, ValueError):
            pts = 1
        bd = a.get("badge") if isinstance(a.get("badge"), dict) else {}
        rows.append({"badge_id": bid, "name": bd.get("name") or badge_names.get(bid, bid),
                     "kind": "single", "season_points": pts, "detail": detail})

    # 3) Copilot-Single-Badges (flying_spree) aus Flügen: für beide Insassen.
    #    Nur ergänzen, wenn nicht schon über die eigene Achievement-Liste erfasst.
    have = {r["badge_id"] for r in rows}
    for bid in copilot_single_found:
        if bid not in have:
            rows.append({"badge_id": bid, "name": badge_names.get(bid, bid),
                         "kind": "single", "season_points": 1,
                         "detail": "Copilot-Flug (SG)"})

    total = sum(r["season_points"] for r in rows)
    rows.sort(key=lambda r: (-r["season_points"], r["name"].lower()))

    # Zusatz-Kennzahlen für das Tool-Format (badgeAnalysis-kompatibel)
    ach = load_achievements(client, uid)
    all_time_points = 0
    for a in ach:
        try:
            all_time_points += int(a.get("points") or 1)
        except (TypeError, ValueError):
            all_time_points += 1
    # IST-Stand am Saisonende je Multi-Level-Badge = max(Vorjahr, in Saison erflogen).
    # Das ist die Basis-Historie für die Folgesaison (vollständig, mit 0).
    end_state = {}
    for bid in multi:
        end_state[bid] = max(int(prev.get(bid, 0) or 0), int(cur.get(bid, 0) or 0))

    extra = {
        "allTimeBadgeCount": all_time_points,
        "badgeCategoryCount": len({r["badge_id"] for r in rows}),
        "multiLevelCount": len([r for r in rows if r["kind"] == "multi"]),
        "end_state": end_state,
    }
    return rows, total, extra


# ---- Hauptlauf -----------------------------------------------------
def main():
    p = argparse.ArgumentParser(description="Saison-Badge-Wertung mit File-Abzug.")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--club", type=int)
    src.add_argument("--users-file")
    src.add_argument("--users", type=int, nargs="+")
    src.add_argument("--user", type=int)

    p.add_argument("--season", type=int, default=2026)
    p.add_argument("--hist-dir", help="Ordner mit historical-badges-*.json (z. B. public/data)")
    p.add_argument("--proxy", metavar="URL")
    p.add_argument("--csv", metavar="DATEI")
    p.add_argument("--json", metavar="DATEI")
    p.add_argument("--tool-json", metavar="DATEI",
                   help="Ergebnis im Tool-Format (badgeAnalysis pro userId) — z. B. season-badges-2025.json")
    p.add_argument("--emit-history", metavar="DATEI",
                   help="IST-Stand Ende Saison als historical-badges-<N>.json schreiben (Basis fuer Folgesaison)")
    p.add_argument("--detail", action="store_true")
    p.add_argument("--no-cache", action="store_true")
    args = p.parse_args()

    client = WeGlideClient(proxy=args.proxy,
                           api_key=os.environ.get("WEGLIDE_API_KEY"),
                           use_cache=not args.no_cache)

    print(f"\n📋 Saison {season_label(args.season)}  ·  Abzug aus File {args.season-1}")
    multi, badge_names, badge_defs = load_multilevel_ids(client)
    print(f"   {len(multi)} Multi-Level-Badges bekannt")
    prev_levels, _ = load_prev_levels(args.season - 1, args.hist_dir)
    cur_levels, _  = load_prev_levels(args.season, args.hist_dir)  # Stand Ende dieser Saison

    # Pilotenmenge
    names = {}
    if args.user:
        user_ids = [args.user]
    elif args.users:
        user_ids = uniq(args.users)
    elif args.users_file:
        user_ids = parse_ids_file(args.users_file)
    else:
        user_ids, names = enumerate_club_pilots(client, args.club)

    if not user_ids:
        print("❌  Keine Piloten gefunden.", file=sys.stderr)
        return 1

    print(f"   {len(user_ids)} Piloten\n{'='*60}")

    results, all_rows = [], []
    for i, uid in enumerate(user_ids, 1):
        u = client.get(f"user/{uid}") or {}
        name = names.get(uid) or u.get("name") or f"User {uid}"
        rows, total, extra = compute_pilot(client, uid, args.season, multi, badge_names, prev_levels, cur_levels)
        results.append((name, uid, total, rows, extra))
        for r in rows:
            all_rows.append({"user_id": uid, "pilot": name, **r})
        print(f"  [{i:>2}/{len(user_ids)}] {name:<26} {total:>3} Punkte "
              f"({len(rows)} Badges)   [Requests: {client.request_count}]")

    results.sort(key=lambda x: -x[2])
    print(f"\n{'='*60}\n  BADGE-WERTUNG Saison {season_label(args.season)}\n{'='*60}")
    for rank, (name, uid, total, rows, extra) in enumerate(results, 1):
        print(f"  {rank:>2}. {name:<26} {total:>3} Punkte")
        if args.detail:
            for r in rows:
                print(f"        {r['season_points']:>2}  {r['name']:<22} {r['detail']}")

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8-sig") as fh:
            w = csvmod.DictWriter(fh, fieldnames=[
                "user_id", "pilot", "badge_id", "name", "kind", "season_points", "detail"])
            w.writeheader(); w.writerows(all_rows)
        print(f"\n💾 CSV: {args.csv}")

    if args.json:
        Path(args.json).write_text(json.dumps({
            "season": args.season, "season_label": season_label(args.season),
            "pilots": [{"user_id": u, "pilot": n, "total_points": t, "badges": r}
                       for (n, u, t, r, _e) in results]}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"💾 JSON: {args.json}")

    if args.tool_json:
        tool = {}
        for (name, uid, total, rows, extra) in results:
            def _enrich(r):
                bd = badge_defs.get(r["badge_id"], {})
                # End-Level dieser Saison aus detail "Level X→Y" (Y); single = 1
                end_level = 1
                d = r.get("detail", "")
                if "→" in d:
                    try:
                        end_level = int(d.split("→")[1].split()[0])
                    except (ValueError, IndexError):
                        end_level = r["season_points"]
                return {
                    "badge_id": r["badge_id"],
                    "name": r["name"],
                    "points": r["season_points"],        # Saison-Punkte
                    "seasonPoints": r["season_points"],
                    "level": end_level,                  # erreichtes End-Level der Saison
                    "type": "multi-level" if r["kind"] == "multi" else "single-level",
                    "detail": r["detail"],
                    "logo": bd.get("logo", ""),
                    "description": bd.get("description", ""),
                    "badge": bd,                         # voller Katalog-Eintrag (name, logo, description, values, points)
                }
            badges_out = [_enrich(r) for r in rows]
            tool[str(uid)] = {
                "userId": uid,
                "userName": name,
                "badges": badges_out,
                "seasonBadges": badges_out,
                "seasonBadgeCount": total,
                "badgeCount": total,
                "allTimeBadgeCount": extra["allTimeBadgeCount"],
                "badgeCategoryCount": extra["badgeCategoryCount"],
                "multiLevelCount": extra["multiLevelCount"],
                "singleLevelCount": len([r for r in rows if r["kind"] == "single"]),
                "flightsWithBadges": len({r["badge_id"] for r in rows}),
                "flightsAnalyzed": 0,
            }
        out = {
            "season": args.season,
            "season_label": season_label(args.season),
            "generated": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M"),
            "pilots": tool,
        }
        Path(args.tool_json).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"💾 Tool-JSON: {args.tool_json}  ({len(tool)} Piloten)")

    if args.emit_history:
        hist = {}
        for (name, uid, total, rows, extra) in results:
            badges = {b: lvl for b, lvl in (extra.get("end_state") or {}).items()}
            hist[str(uid)] = {"name": name, "badges": badges}
        out = {
            "season": args.season,
            "season_label": season_label(args.season),
            "description": f"IST-Stand aller Multi-Level-Badges Ende Saison {season_label(args.season)} (Basis fuer Folgesaison)",
            "generated": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M"),
            "pilots": hist,
        }
        Path(args.emit_history).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"💾 History-JSON: {args.emit_history}  ({len(hist)} Piloten)")

    print(f"\n📊 Requests gesamt: {client.request_count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
