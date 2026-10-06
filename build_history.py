#!/usr/bin/env python3
"""
build_history.py — History-Stand per Stichtag aus ALLEN Flügen rekonstruieren
=============================================================================
Erzeugt historical-badges-<N>.json = IST-Stand aller MULTI-LEVEL-Badges
per 30.09.N, rekonstruiert aus der Flug-Historie (nicht aus 'created').

Pro Pilot: alle Flüge laden, aus jedem flightdetail die Multi-Level-Badges
lesen, pro Badge das HÖCHSTE Level nehmen, dessen Flug scoring_date <= 30.09.N.
Copilot-Badges (cockpit_crew, always_by_your_side, consistency) zählen für
BEIDE Insassen (kein user_id-Filter). Nur Flüge mit club.id == SG (1281).

Damit ist der Stand exakt per Stichtag korrekt, auch für Badges, die erst
später hochgestuft wurden (created liegt dann in der Zukunft).

KEINE Abhängigkeiten (urllib). KEIN API-Key über den Proxy.
ACHTUNG: 1 Request pro Flug — Cache aktiv, Erstlauf lang.

Aufruf:
  python build_history.py --club 1281 --season 2024 \
      --proxy https://sgsaentiscup.vercel.app/api/proxy \
      --out public/data/historical-badges-2024.json
  python build_history.py --club 1281 --season 2025 \
      --proxy https://sgsaentiscup.vercel.app/api/proxy \
      --out public/data/historical-badges-2025.json

Kontrolle für einen Piloten (kein File):
  python build_history.py --user 9604 --season 2025 --proxy ...
"""
from __future__ import annotations
import argparse, hashlib, json, os, sys, time
import urllib.error, urllib.parse, urllib.request
from pathlib import Path

BASE_URL="https://api.weglide.org/v1"
CACHE_DIR=Path(os.environ.get("WEGLIDE_CACHE_DIR",".weglide_cache"))
CACHE_TTL_H=float(os.environ.get("WEGLIDE_CACHE_TTL_H",168)); TIMEOUT=30; PAUSE=0.25; FLIGHT_PAGE=100
SG_CLUB_ID=1281
# Multi-Level-Badges, die fuer BEIDE Doppelsitzer-Insassen zaehlen:
COPILOT_BADGES = {"cockpit_crew", "always_by_your_side", "consistency"}
# Single-Level-Badges, die fuer BEIDE zaehlen (Pilot oder Copilot):
COPILOT_SINGLE_BADGES = {"flying_spree"}
HEADERS={"Accept":"application/json, text/plain, */*","Accept-Language":"de-DE,de;q=0.9,en;q=0.8",
 "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
 "Referer":"https://weglide.org/","Origin":"https://weglide.org"}

class Client:
    def __init__(s, proxy=None, key=None, cache=True):
        s.proxy=proxy.rstrip("/") if proxy else None; s.key=key; s.cache=cache; s.n=0
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
    def _cf(s,p):
        k=hashlib.sha1(p.encode()).hexdigest()[:16]; safe="".join(c if c.isalnum() else "_" for c in p)[:50].strip("_")
        return CACHE_DIR/f"{safe}__{k}.json"
    def get(s,path):
        f=s._cf(path)
        if s.cache and f.exists() and (time.time()-f.stat().st_mtime)/3600<=CACHE_TTL_H:
            try: return json.loads(f.read_text("utf-8"))
            except: pass
        url=f"{s.proxy}?path={urllib.parse.quote(path,safe='/')}" if s.proxy else f"{BASE_URL}/{path}"
        req=urllib.request.Request(url,method="GET")
        for k,v in HEADERS.items(): req.add_header(k,v)
        if s.key: req.add_header("X-API-Key",s.key)
        try:
            with urllib.request.urlopen(req,timeout=TIMEOUT) as r:
                cs=r.headers.get_content_charset() or "utf-8"; status,body=r.status,r.read().decode(cs,errors="replace")
        except urllib.error.HTTPError as e:
            status=e.code
            try: body=e.read().decode("utf-8",errors="replace")
            except: body=""
        except urllib.error.URLError: return None
        s.n+=1; time.sleep(PAUSE)
        if status==200:
            try: data=json.loads(body)
            except: return None
            try: f.write_text(json.dumps(data,ensure_ascii=False),encoding="utf-8")
            except: pass
            return data
        return None

def multi_ids(c):
    b=c.get("badge"); m=set()
    if isinstance(b,list):
        for x in b:
            if isinstance(x.get("points"),list) and len(x["points"])>1: m.add(x.get("id",""))
    return m

def club_pilots(c,club):
    ids,names,skip=[],{},0
    for _ in range(80):
        q=urllib.parse.urlencode({"club_id_in":club,"order_by":"-scoring_date","not_scored":"false","limit":FLIGHT_PAGE,"skip":skip})
        d=c.get(f"flight?{q}"); batch=d if isinstance(d,list) else (d or {}).get("results") if isinstance(d,dict) else None
        if not batch: break
        for f in batch:
            u=f.get("user") if isinstance(f,dict) else None
            if isinstance(u,dict) and u.get("id"): ids.append(int(u["id"])); names.setdefault(int(u["id"]),u.get("name"))
        if len(batch)<FLIGHT_PAGE: break
        skip+=FLIGHT_PAGE
    seen=set(); out=[]
    for i in ids:
        if i not in seen: seen.add(i); out.append(i)
    return out,names

def _flights_by(c, param, uid):
    fl,skip=[],0
    for _ in range(80):
        q=urllib.parse.urlencode({param:uid,"order_by":"-scoring_date","not_scored":"false","limit":FLIGHT_PAGE,"skip":skip})
        d=c.get(f"flight?{q}"); batch=d if isinstance(d,list) else (d or {}).get("results") if isinstance(d,dict) else None
        if not batch: break
        for f in batch:
            if isinstance(f,dict) and f.get("id"):
                fl.append((f["id"], str(f.get("scoring_date") or f.get("takeoff_time") or "")[:10]))
        if len(batch)<FLIGHT_PAGE: break
        skip+=FLIGHT_PAGE
    return fl

def all_flights(c,uid):
    """ALLE Flüge des Piloten, als PIC UND als Copilot, dedupliziert."""
    seen={}
    for (fid,fdate) in _flights_by(c,"user_id_in",uid) + _flights_by(c,"co_user_id_in",uid):
        seen[fid]=fdate
    return list(seen.items())

def pilot_state(c, uid, cutoff, multi):
    """Höchstes Multi-Level je Badge aus SG-Flügen mit scoring_date <= cutoff."""
    state={}
    for fid,fdate in all_flights(c,uid):
        if not fdate or fdate>cutoff: continue
        d=c.get(f"flightdetail/{fid}")
        if not isinstance(d,dict): continue
        if (d.get("club") or {}).get("id")!=SG_CLUB_ID: continue
        for a in (d.get("achievement") or []):
            bid=a.get("badge_id")
            if not bid or bid not in multi: continue
            a_uid=a.get("user_id")
            if bid not in COPILOT_BADGES and a_uid is not None and int(a_uid)!=int(uid): continue
            try: lvl=int(a.get("points") or 0)
            except: lvl=0
            if lvl>state.get(bid,0): state[bid]=lvl
    return state

def main():
    p=argparse.ArgumentParser(description="History-Stand per Stichtag aus allen Flügen rekonstruieren.")
    src=p.add_mutually_exclusive_group(required=True)
    src.add_argument("--club",type=int)
    src.add_argument("--user",type=int)
    p.add_argument("--season",type=int,required=True,help="Saison, deren Ende (30.09.N) der Stichtag ist")
    p.add_argument("--proxy"); p.add_argument("--out",default=None); p.add_argument("--no-cache",action="store_true")
    a=p.parse_args()
    cutoff=f"{a.season}-09-30"
    c=Client(a.proxy, os.environ.get("WEGLIDE_API_KEY"), not a.no_cache)

    print(f"History-Stand per {cutoff}  (aus allen Flügen <= Stichtag)")
    multi=multi_ids(c); print(f"{len(multi)} Multi-Level-Badges bekannt")

    if a.user:
        pilots=[a.user]; names={}
    else:
        pilots,names=club_pilots(c,a.club); print(f"{len(pilots)} Piloten")

    out={}
    for i,uid in enumerate(pilots,1):
        st=pilot_state(c,uid,cutoff,multi)
        u=c.get(f"user/{uid}") or {}
        name=names.get(uid) or u.get("name") or f"User {uid}"
        # vollständig mit 0 auflisten
        badges={b: st.get(b,0) for b in sorted(multi)}
        out[str(uid)]={"name":name,"badges":badges}
        nz=sum(1 for v in badges.values() if v>0)
        print(f"  [{i:>2}/{len(pilots)}] {name:<26} {nz} Multi-Level > 0   [Requests: {c.n}]")

    if a.user and not a.out:
        st=out[str(a.user)]["badges"]
        print("\nStand per Stichtag:")
        for b,l in sorted(st.items()):
            if l: print(f"    {b:<22} Level {l}")
        return 0

    outfile=a.out or f"historical-badges-{a.season}.json"
    data={"metadata":{"season":f"{a.season-1}/{a.season}","cutoff":cutoff,
          "description":f"IST-Stand Multi-Level per {cutoff} (aus Flügen rekonstruiert)","clubId":a.club or SG_CLUB_ID,
          "multiLevelBadges":sorted(multi)},"pilots":out}
    Path(outfile).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"\n💾 {outfile}  ({len(out)} Piloten)   Requests: {c.n}")
    return 0

if __name__=="__main__": sys.exit(main())
