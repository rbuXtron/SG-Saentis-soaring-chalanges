#!/usr/bin/env python3
"""
list_base_badges.py — Multi-Level-Badges bis Stichtag auflisten (Basis-Hilfe)
=============================================================================
Listet pro Club-Pilot die MULTI-LEVEL-Badges, deren 'created' <= Stichtag
(Standard 30.09.2024) liegt — also den Basis-Stand inkl. 2023er-Badges.
Hilft beim manuellen Befüllen von historical-badges-2024.json.

Schnell: 1 Request pro Pilot (Achievement-Liste), kein flightdetail.
KEINE Abhängigkeiten (urllib). KEIN API-Key über den Proxy.

Achtung: 'created' = letzte Stufenänderung. Ein Badge, das nach dem Stichtag
hochgestuft wurde, erscheint hier NICHT (auch wenn ein Level schon vorher da
war) — solche Fälle musst du zusätzlich aus den Flügen/manuell ergänzen.
Deshalb: diese Liste ist der created-basierte Startpunkt, nicht das letzte Wort.

Aufruf:
  python list_base_badges.py --club 1281 --proxy https://sgsaentiscup.vercel.app/api/proxy
  python list_base_badges.py --club 1281 --cutoff 2024-09-30 --json basis_kandidaten.json --proxy ...
  python list_base_badges.py --user 10518 --proxy ...          # nur ein Pilot
  python list_base_badges.py --club 1281 --year 2023 --proxy ...  # nur 2023er-Badges zeigen
"""
from __future__ import annotations
import argparse, hashlib, json, os, sys, time
import urllib.error, urllib.parse, urllib.request
from pathlib import Path

BASE_URL="https://api.weglide.org/v1"
CACHE_DIR=Path(os.environ.get("WEGLIDE_CACHE_DIR",".weglide_cache"))
CACHE_TTL_H=float(os.environ.get("WEGLIDE_CACHE_TTL_H",168)); TIMEOUT=30; PAUSE=0.25; FLIGHT_PAGE=100
HEADERS={"Accept":"application/json, text/plain, */*","Accept-Language":"de-DE,de;q=0.9,en;q=0.8",
 "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
 "Referer":"https://weglide.org/","Origin":"https://weglide.org"}

class Client:
    def __init__(s,proxy=None,key=None,cache=True):
        s.proxy=proxy.rstrip("/") if proxy else None; s.key=key; s.cache=cache; s.n=0
        CACHE_DIR.mkdir(parents=True,exist_ok=True)
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
            if isinstance(x.get("points"),list) and len(x["points"])>1:
                m.add(x.get("id","")); names[x.get("id","")]=x.get("name",x.get("id",""))
    return m,names

def club_pilots(c,club):
    ids,names,skip=[],{},0
    for _ in range(80):
        q=urllib.parse.urlencode({"club_id_in":club,"order_by":"-scoring_date","not_scored":"false","limit":FLIGHT_PAGE,"skip":skip})
        d=c.get(f"flight?{q}"); batch=d if isinstance(d,list) else (d or {}).get("results") if isinstance(d,dict) else None
        if not batch: break
        for f in batch:
            u=f.get("user") if isinstance(f,dict) else None
            if isinstance(u,dict) and u.get("id"): ids.append(int(u["id"])); names.setdefault(int(u["id"]),u.get("name"))
            cu=f.get("co_user") if isinstance(f,dict) else None
            if isinstance(cu,dict) and cu.get("id"): ids.append(int(cu["id"])); names.setdefault(int(cu["id"]),cu.get("name"))
        if len(batch)<FLIGHT_PAGE: break
        skip+=FLIGHT_PAGE
    seen=set(); out=[]
    for i in ids:
        if i not in seen: seen.add(i); out.append(i)
    return out,names

def main():
    p=argparse.ArgumentParser(description="Multi-Level-Badges bis Stichtag pro Pilot auflisten.")
    g=p.add_mutually_exclusive_group(required=True)
    g.add_argument("--club",type=int); g.add_argument("--user",type=int)
    p.add_argument("--cutoff",default="2024-09-30",help="Stichtag (Standard 2024-09-30)")
    p.add_argument("--year",type=int,help="nur Badges mit created in diesem Kalenderjahr zeigen")
    p.add_argument("--proxy"); p.add_argument("--json",help="Basis-Kandidaten als JSON speichern")
    p.add_argument("--no-cache",action="store_true")
    a=p.parse_args()
    c=Client(a.proxy,os.environ.get("WEGLIDE_API_KEY"),not a.no_cache)

    multi,mnames=multi_ids(c)
    print(f"{len(multi)} Multi-Level-Badges bekannt · Stichtag {a.cutoff}"
          + (f" · nur Jahr {a.year}" if a.year else ""))

    if a.user:
        pilots=[a.user]; names={}
    else:
        pilots,names=club_pilots(c,a.club); print(f"{len(pilots)} Piloten\n")

    out={}
    for i,uid in enumerate(pilots,1):
        ach=c.get(f"achievement/user/{uid}") or []
        u=c.get(f"user/{uid}") or {}
        name=names.get(uid) or u.get("name") or (ach[0].get("user",{}).get("name") if ach else f"User {uid}")
        rows={}
        for x in ach:
            bid=x.get("badge_id")
            if bid not in multi: continue
            cr=str(x.get("created") or "")[:10]
            if not cr or cr>a.cutoff: continue
            if a.year and cr[:4]!=str(a.year): continue
            try: lvl=int(x.get("points") or 0)
            except: lvl=0
            rows[bid]=max(rows.get(bid,0),lvl)
        if rows:
            out[str(uid)]={"name":name,"badges":rows}
        line=", ".join(f"{b}={l}" for b,l in sorted(rows.items())) or "—"
        print(f"  [{i:>2}/{len(pilots)}] {name:<26} {line}")

    if a.json:
        Path(a.json).write_text(json.dumps({"cutoff":a.cutoff,"pilots":out},ensure_ascii=False,indent=2),encoding="utf-8")
        print(f"\n💾 {a.json}  ({len(out)} Piloten)")
    print(f"\n📊 Requests: {c.n}")
    print("Hinweis: 'created' = letzte Stufenänderung. Badges, die nach dem Stichtag")
    print("hochgestuft wurden, fehlen hier evtl. -> aus Flügen/manuell ergänzen.")
    return 0

if __name__=="__main__": sys.exit(main())
