#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_badge_history.py — Badge-Level-Verlauf aus dem Tagesarchiv bauen
======================================================================
Liest alle Light-Level-Snapshots aus  <data>/badge-levels/<YYYY-MM-DD>.json
(erzeugt taeglich von weglide_snapshot_club.py) und leitet daraus pro Pilot
und Badge den LEVEL-VERLAUF ab — ohne Flug-Scan:

  * Steigt ein Level von einem Tag zum naechsten, ist das Datum des neuen
    Snapshots (bzw. das 'created' des Achievements) der Zeitpunkt, an dem die
    Stufe fiel. Flug-Link kommt aus der flight_id des Achievements.
  * Das gilt auch fuer flug-lose Badges (kein Flug-Scan noetig).

Schreibt  <data>/badge-history-latest.json  im Format, das die App beim
Klick auf ein Multi-Level-Badge liest:

  { "generated": "...", "date": "<neuester Snapshot>",
    "pilots": { "<uid>": { "name": ...,
       "badges": { "<badge_id>": { "level": N,
                    "history": [[level, "YYYY-MM-DD", flight_id|null], ...] } } } } }

EHRLICH: Fuer Level, die VOR dem ersten Snapshot erreicht wurden, kennen wir
nur das oberste (dessen created/Flug im Achievement steht); die darunter
liegenden Vor-Aufzeichnungs-Stufen lassen sich nicht datieren. Jede Stufe, die
WAEHREND der Aufzeichnung faellt, bekommt ein praezises Datum.
Einmaliger Backfill der Alt-Stufen: weglide_snapshot_club.py --with-history.

KEINE Netzwerkzugriffe, keine Abhaengigkeiten.

Aufruf (nach dem taeglichen Snapshot):
  python build_badge_history.py --data public/data
"""
from __future__ import annotations
import argparse, json, datetime
from pathlib import Path


def load_snapshots(lvdir):
    snaps = []
    for f in sorted(lvdir.glob("*.json")):
        try:
            d = json.loads(f.read_text("utf-8"))
        except Exception:
            continue
        date = str(d.get("date") or f.stem)[:10]
        pilots = d.get("pilots") or {}
        if date and isinstance(pilots, dict):
            snaps.append((date, pilots))
    snaps.sort(key=lambda x: x[0])
    return snaps


def load_backfill(path):
    """Flug-Scan-Backfill (badge-history-backfill.json) als Seed -> state."""
    state = {}
    try:
        d = json.loads(Path(path).read_text("utf-8"))
    except Exception:
        return state
    for uid, p in (d.get("pilots") or {}).items():
        badges = {}
        for bid, b in (p.get("badges") or {}).items():
            try:
                lvl = int(b.get("level"))
            except Exception:
                continue
            hist = [list(e) for e in (b.get("history") or [])]
            badges[bid] = {"level": lvl, "history": hist}
        state[uid] = {"name": p.get("name"), "badges": badges}
    return state


def build(snaps, state=None):
    # state: uid -> {"name":.., "badges": {bid: {"level":L, "history":[[lvl,date,fid],...]}}}
    state = state if state is not None else {}
    for date, pilots in snaps:
        for uid, pdata in pilots.items():
            name = pdata.get("name")
            b = pdata.get("b") or {}
            st = state.setdefault(uid, {"name": name, "badges": {}})
            if name:
                st["name"] = name
            for bid, rec in b.items():
                # rec = [level, flight_id, created]
                try:
                    lvl = int(rec[0])
                except Exception:
                    continue
                fid = rec[1] if len(rec) > 1 else None
                created = (rec[2] if len(rec) > 2 and rec[2] else "")
                when = created or date   # echtes Achievement-Datum, sonst Snapshot-Tag
                bst = st["badges"].get(bid)
                if bst is None:
                    # Erstbeobachtung: nur die oberste Stufe ist datierbar
                    st["badges"][bid] = {"level": lvl, "history": [[lvl, when, fid]]}
                elif lvl > bst["level"]:
                    for L in range(bst["level"] + 1, lvl + 1):
                        bst["history"].append([L, when, fid])
                    bst["level"] = lvl
                # lvl == level: nichts; lvl < level: ignorieren (sollte nicht vorkommen)
    return state


def main():
    ap = argparse.ArgumentParser(description="Badge-Level-Verlauf aus dem Tagesarchiv bauen.")
    ap.add_argument("--data", default="public/data", help="Ordner mit badge-levels/ und Ziel der Ausgabe")
    ap.add_argument("--levels-dir", default=None, help="abweichender badge-levels-Ordner")
    ap.add_argument("--backfill", default=None, help="Flug-Scan-Seed (Default: <data>/badge-history-backfill.json)")
    ap.add_argument("--out", default=None, help="abweichende Ausgabedatei")
    a = ap.parse_args()

    data = Path(a.data)
    lvdir = Path(a.levels_dir) if a.levels_dir else (data / "badge-levels")
    out = Path(a.out) if a.out else (data / "badge-history-latest.json")
    bfpath = Path(a.backfill) if a.backfill else (data / "badge-history-backfill.json")

    if not lvdir.is_dir():
        print(f"❌ Kein Ordner {lvdir} — erst weglide_snapshot_club.py laufen lassen.")
        return 1

    seed = load_backfill(bfpath)
    if seed:
        print(f"🌱 Backfill-Seed: {bfpath}  ({len(seed)} Piloten)")

    snaps = load_snapshots(lvdir)
    if not snaps:
        print(f"❌ Keine Snapshots in {lvdir}.")
        return 1
    print(f"{len(snaps)} Tages-Snapshots  ({snaps[0][0]} … {snaps[-1][0]})")

    state = build(snaps, seed)
    doc = {
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "date": snaps[-1][0],
        "pilots": state,
    }
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    nb = sum(len(p["badges"]) for p in state.values())
    print(f"💾 {out}   ({len(state)} Piloten, {nb} Badges mit Verlauf)")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
