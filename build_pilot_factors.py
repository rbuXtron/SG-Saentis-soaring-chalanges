#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_pilot_factors.py — Pilotenfaktoren einer Saison erzeugen
==============================================================
Schreibt  pilot-factors-<N>.json  (Faktor-Baseline, die die App fuer die
FOLGESAISON laedt: loadPilotFactorsFromJSON laedt pilot-factors-<season-1>).

Logik wie data-processor.js:
  bester EIGENER Flug der Saison (user_id_in = Pilot, scoring_date im Fenster)
  -> Faktor nach Distanz-Stufen:
       <=50 ->4.0  <=100 ->3.0  <=300 ->2.0  <=500 ->1.6
       <=700 ->1.4  <=1000 ->1.2  >1000 ->1.0
  Dabei NIE schlechter als die Vorsaison (Carry-over):
       factor = min(vorsaison_factor, stufe(bester_flug))
  bestDistance = bester eigener Flug DIESER Saison (sonst Vorsaison-Wert).

Format (identisch zum Beispiel):
  { "metadata": {season, generated, description},
    "pilots": { "<uid>": {name, factor, bestDistance, lastUpdated}, ... } }

KEINE Abhaengigkeiten (nur urllib). KEIN API-Key ueber den Proxy.

Aufruf:
  python build_pilot_factors.py --club 1281 --season-year 2026 \
      --proxy https://sgsaentiscup.vercel.app/api/proxy --out-dir public/data
"""
from __future__ import annotations
import argparse, hashlib, json, os, sys, time, datetime
import urllib.error, urllib.parse, urllib.request
from pathlib import Path

CACHE_DIR = Path(os.environ.get("WEGLIDE_CACHE_DIR", ".weglide_cache"))
TIMEOUT = 30; PAUSE = 0.25; PAGE = 100
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://weglide.org/", "Origin": "https://weglide.org",
}


class Client:
    def __init__(s, proxy=None, cache=True):
        s.proxy = proxy.rstrip("/") if proxy else None
        s.cache = cache; s.n = 0
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def get(s, path, allow_cache=True):
        f = CACHE_DIR / (("".join(c if c.isalnum() else "_" for c in path)[:50]).strip("_")
                         + "__" + hashlib.sha1(path.encode()).hexdigest()[:16] + ".json")
        if s.cache and allow_cache and f.exists():
            try: return json.loads(f.read_text("utf-8"))
            except Exception: pass
        url = f"{s.proxy}?path={urllib.parse.quote(path, safe='/')}" if s.proxy else "https://api.weglide.org/v1/" + path
        req = urllib.request.Request(url, method="GET")
        for k, v in HEADERS.items(): req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                body = r.read().decode(r.headers.get_content_charset() or "utf-8", "replace"); st = r.status
        except urllib.error.HTTPError as e:
            st = e.code; body = ""
        except urllib.error.URLError:
            return None
        s.n += 1; time.sleep(PAUSE)
        if st == 200:
            try: data = json.loads(body)
            except Exception: return None
            try: f.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
            except Exception: pass
            return data
        return None


def tier(km):
    if km <= 50:   return 4.0
    if km <= 100:  return 3.0
    if km <= 300:  return 2.0
    if km <= 500:  return 1.6
    if km <= 700:  return 1.4
    if km <= 1000: return 1.2
    return 1.0


def season_window(n):
    return (f"{n-1}-10-01", f"{n}-09-30")


def club_pilots(c, club):
    ids, names, skip = [], {}, 0
    for _ in range(80):
        q = urllib.parse.urlencode({"club_id_in": club, "order_by": "-scoring_date",
                                    "not_scored": "false", "limit": PAGE, "skip": skip})
        d = c.get(f"flight?{q}", allow_cache=False)
        batch = d if isinstance(d, list) else ((d or {}).get("results") if isinstance(d, dict) else None)
        if not batch: break
        for fl in batch:
            u = fl.get("user") if isinstance(fl, dict) else None
            if isinstance(u, dict) and u.get("id"):
                uid = int(u["id"]); ids.append(uid); names.setdefault(uid, u.get("name"))
        if len(batch) < PAGE: break
        skip += PAGE
    seen, out = set(), []
    for i in ids:
        if i not in seen: seen.add(i); out.append(i)
    return out, names


def best_flight(c, uid, window):
    """Bester eigener Flug (user_id_in=uid) im Fenster -> (km, 'YYYY-MM-DD')."""
    lo, hi = window
    best, bdate, skip = 0.0, None, 0
    for _ in range(80):
        q = urllib.parse.urlencode({"user_id_in": uid, "order_by": "-scoring_date",
                                    "not_scored": "false", "limit": PAGE, "skip": skip})
        d = c.get(f"flight?{q}", allow_cache=False)
        batch = d if isinstance(d, list) else ((d or {}).get("results") if isinstance(d, dict) else None)
        if not batch: break
        stop = False
        for fl in batch:
            date = str(fl.get("scoring_date") or fl.get("takeoff_time") or "")[:10]
            if not date: continue
            if date < lo:          # aelter als Saison -> absteigend sortiert, ab hier fertig
                stop = True; continue
            if date > hi: continue
            km = ((fl.get("contest") or {}).get("distance")) or 0
            if km > best: best, bdate = float(km), date
        if stop or len(batch) < PAGE: break
        skip += PAGE
    return best, bdate


def load_prev(path):
    try:
        return (json.loads(Path(path).read_text("utf-8")).get("pilots") or {})
    except Exception:
        return {}


def main():
    ap = argparse.ArgumentParser(description="Pilotenfaktoren einer Saison erzeugen.")
    ap.add_argument("--club", type=int, required=True)
    ap.add_argument("--proxy")
    ap.add_argument("--out-dir", default="public/data")
    ap.add_argument("--season-year", type=int, required=True, help="z.B. 2026 fuer Saison 2025/2026")
    ap.add_argument("--prev", default=None, help="Vorsaison-Datei (Default: <out-dir>/pilot-factors-<N-1>.json)")
    ap.add_argument("--no-cache", action="store_true")
    a = ap.parse_args()

    n = a.season_year
    window = season_window(n)
    today = datetime.date.today().isoformat()
    c = Client(a.proxy, not a.no_cache)

    prev_path = a.prev or (Path(a.out_dir) / f"pilot-factors-{n-1}.json")
    prev = load_prev(prev_path)
    print(f"Saison {n-1}/{n}  ·  Fenster {window[0]} – {window[1]}")
    print(f"Vorsaison-Faktoren: {prev_path}  ({len(prev)} Piloten)")

    ids, names = club_pilots(c, a.club)
    print(f"{len(ids)} Piloten im Club")

    pilots = {}
    for i, uid in enumerate(ids, 1):
        su = str(uid)
        pv = prev.get(su, {})
        pf_prev = pv.get("factor", 4.0)
        best, bdate = best_flight(c, uid, window)
        name = names.get(uid) or pv.get("name") or (c.get(f"user/{uid}") or {}).get("name") or f"User {uid}"
        if best > 0:
            factor = min(pf_prev, tier(best))
            dist = int(round(best)); lu = bdate
        else:
            factor = pf_prev; dist = pv.get("bestDistance", 0); lu = pv.get("lastUpdated", today)
        pilots[su] = {"name": name, "factor": factor, "bestDistance": dist, "lastUpdated": lu}
        print(f"  [{i:>2}/{len(ids)}] {name:<26} best={dist:>4} km  -> Faktor {factor}  [Req:{c.n}]")

    doc = {
        "metadata": {
            "season": f"{n-1}/{n}",
            "generated": today,
            "description": f"Pilotenfaktoren Ende Saison {n-1}/{n}",
        },
        "pilots": pilots,
    }
    outdir = Path(a.out_dir); outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / f"pilot-factors-{n}.json"
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=4), encoding="utf-8")
    print(f"\n💾 {out}   ({len(pilots)} Piloten, Requests: {c.n})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
