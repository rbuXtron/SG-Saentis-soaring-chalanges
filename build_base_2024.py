#!/usr/bin/env python3
"""
build_base_2024.py — Basis-Historie historical-badges-2024.json
================================================================
IST-Stand aller MULTI-LEVEL-Badges per 30.09.2024, pro Pilot.

Quelle: Achievement-Liste. Ein Multi-Level-Badge zählt für Ende 2024,
wenn sein 'created' <= 2024-09-30 liegt (dann ist points = Level Ende 2024).
Badges, die erst später hochgestuft wurden, fehlen hier zwangsläufig
(alte Flüge nicht mehr abrufbar) -> per --patch manuell nachtragen.

KEINE Abhängigkeiten (urllib). KEIN API-Key über den Proxy.

Aufruf:
  python build_base_2024.py --club 1281 --proxy https://sgsaentiscup.vercel.app/api/proxy \
      --patch patch-2024.json --out public/data/historical-badges-2024.json

patch-2024.json (manuelle Korrekturen, Beispiel):
  { "9604": { "explorer": 1, "no_need_to_circle": 1 } }
"""
from __future__ import annotations
import argparse, hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

BASE_URL="https://api.weglide.org/v1"; CACHE_DIR=Path(os.environ.get("WEGLIDE_CACHE_DIR",".weglide_cache"))
CACHE_TTL_H=float(os.environ.get("WEGLIDE_CACHE_TTL_H",168)); TIMEOUT=30; PAUSE=0.25; FLIGHT_PAGE=100
CUTOFF="2024-09-30"
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
    b=c.get("badge"); m=set(); names={}
    if isinstance(b,list):
        for x in b:
            bid=x.get("id",""); names[bid]=x.get("name",bid)
            p=x.get("points",[])
            if isinstance(p,list) and len(p)>1: m.add(bid)
    return m,names

def club_pilots(c,club):
    ids,names,skip=[],{},0
    for _ in range(60):
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

def main():
    p=argparse.ArgumentParser(description="Basis-Historie 2024 (IST-Stand 30.09.2024, Multi-Level).")
    p.add_argument("--club",type=int,default=1281); p.add_argument("--proxy")
    p.add_argument("--patch",help="JSON mit manuellen Korrekturen {userId:{badge:level}}")
    p.add_argument("--out",default="historical-badges-2024.json")
    p.add_argument("--no-cache",action="store_true")
    a=p.parse_args()
    c=Client(a.proxy, os.environ.get("WEGLIDE_API_KEY"), not a.no_cache)

    multi,names_def=multi_ids(c)
    print(f"{len(multi)} Multi-Level-Badges bekannt")
    pilots,pnames=club_pilots(c,a.club)
    print(f"{len(pilots)} Piloten")

    patch={}
    if a.patch:
        patch=json.loads(Path(a.patch).read_text("utf-8"))
        print(f"Patch geladen: {len(patch)} Piloten mit manuellen Werten")

    out_pilots={}
    for i,uid in enumerate(pilots,1):
        ach=c.get(f"achievement/user/{uid}") or []
        name=pnames.get(uid) or (ach[0]["user"]["name"] if ach and isinstance(ach[0].get("user"),dict) else f"User {uid}")
        badges={b:0 for b in multi}
        for x in ach:
            bid=x.get("badge_id")
            if bid not in multi: continue
            created=str(x.get("created") or "")[:10]
            if created and created<=CUTOFF:
                try: badges[bid]=max(badges[bid], int(x.get("points") or 0))
                except: pass
        # manuelle Korrekturen
        for bid,lvl in (patch.get(str(uid)) or {}).items():
            badges[bid]=int(lvl)
        out_pilots[str(uid)]={"name":name,"badges":badges}
        nz=sum(1 for v in badges.values() if v>0)
        print(f"  [{i:>2}/{len(pilots)}] {name:<26} {nz} Multi-Level > 0   [Requests: {c.n}]")

    data={"metadata":{"season":"2023/2024","description":"IST-Stand Multi-Level-Badges per 30.09.2024 (Basis)",
          "clubId":a.club,"cutoff":CUTOFF,"multiLevelBadges":sorted(multi)},"pilots":out_pilots}
    Path(a.out).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"\n💾 {a.out}  ({len(out_pilots)} Piloten)   Requests: {c.n}")
    return 0

if __name__=="__main__": sys.exit(main())
