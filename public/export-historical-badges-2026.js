// =====================================================================
//  Export historical-badges-2026.json  —  im Browser-Console ausführen
// =====================================================================
//
//  WANN: Auf der laufenden App (vercel dev ODER sgsaentiscup.vercel.app),
//        wenn SAISON 2026 (2025/2026) geladen und die Rangliste sichtbar ist.
//
//  WAS:  Liest die live-korrekten Piloten-Daten (window.pilotData) — also
//        genau die Werte, die die Detail-Ansicht ("Saison Badges für …")
//        rendert — und schreibt daraus den KUMULATIVEN Multi-Level-Stand
//        per 30.09.2026.
//
//  REGEL: All-Time-Level pro Badge = max( Baseline 2025 , Saison-2026-Level ).
//         Lückenlos, weil jedes Level vor dem 1.10.2025 in der 2025-Baseline
//         steht und jedes 2026 neu erreichte Level in den Saison-Badges.
//         Dadurch stimmt u.a. always_by_your_side automatisch (nur der echte
//         Copilot hat den Badge in seinen Saison-Badges).
//
//  NUTZUNG:  Diesen ganzen Block in die Browser-Konsole einfügen und Enter.
//            Die Datei wird heruntergeladen; die Konsole zeigt eine
//            Selbstprüfung gegen Johannes (29951) und Roman (10518).
// =====================================================================

(async function exportHistoricalBadges2026() {
  // --- Kanonische Multi-Level-Badge-Liste (aus multi-level-badge-evaluator.js) ---
  const MULTI = [
    "astronaut", "explorer", "no_need_to_circle", "pythagoras", "zugvogel",
    "euclid", "aeronaut", "endurance", "sprinter", "point_hunter",
    "walk_of_fame", "consistency", "segment_specialist", "vintage_viper",
    "sky_streak", "cockpit_crew", "always_by_your_side", "aircraft_hopper",
    "nomad", "tourist", "flying_in_circles", "globe_trotter",
    "training_lap", "day_winner"
  ];

  // --- Soll-Werte aus den beiden geprüften Screenshots (Selbstkontrolle) ---
  //     Erwartet wird: berechnetes All-Time-Level >= Saison-Level aus Screenshot.
  const EXPECTED = {
    "29951": { // Johannes Widmer (war Pilot → KEIN always_by_your_side aus Saison)
      sky_streak: 3, zugvogel: 1, cockpit_crew: 2, aeronaut: 1, astronaut: 2,
      consistency: 3, nomad: 2, endurance: 1, vintage_viper: 2, aircraft_hopper: 2
    },
    "10518": { // Roman Andreas Buehler (war Copilot → HAT always_by_your_side)
      sprinter: 3, aircraft_hopper: 1, aeronaut: 2, always_by_your_side: 2,
      vintage_viper: 1, flying_in_circles: 1, euclid: 2, sky_streak: 1,
      segment_specialist: 2
    }
  };

  const pilots = window.pilotData || (window.sgApp && window.sgApp.pilotData);
  if (!pilots || !pilots.length) {
    console.error("❌ Keine Pilotendaten (window.pilotData). Erst Saison 2026 laden!");
    return;
  }
  console.log(`📊 ${pilots.length} Piloten in window.pilotData`);

  // --- Baseline der Vorsaison (2024/2025) laden ---
  let base = { pilots: {} };
  try {
    const r = await fetch("./data/historical-badges-2025.json", { cache: "no-store" });
    if (r.ok) base = await r.json();
    console.log(`📁 Baseline 2025: ${Object.keys(base.pilots || {}).length} Piloten`);
  } catch (e) {
    console.warn("⚠️ Baseline 2025 nicht geladen – starte von 0:", e);
  }

  // --- höchstes Level eines Saison-Badge-Eintrags robust ermitteln ---
  function levelOf(bd) {
    if (bd == null) return 0;
    if (typeof bd.level === "number") return bd.level;
    if (bd.detail) { const m = /→\s*(\d+)/.exec(bd.detail); if (m) return parseInt(m[1], 10); }
    if (typeof bd.points === "number") return bd.points;
    return 0;
  }

  const out = {
    metadata: {
      season: "2025/2026",
      cutoff: "2026-09-30",
      description: "Höchste erreichte Multi-Level Badge Levels per 2026-09-30 (All-Time = max(Baseline 2025, Saison 2026))",
      clubId: 1281,
      clubName: "SG Säntis",
      lastUpdated: new Date().toISOString().slice(0, 16).replace("T", " "),
      multiLevelBadges: MULTI.slice().sort()
    },
    pilots: {}
  };

  pilots.forEach(p => {
    const uid = String(p.userId);
    const startBadges = (base.pilots && base.pilots[uid] && base.pilots[uid].badges) || {};

    // Schlüsselmenge = kanonische Liste ∪ was die Baseline schon kennt (nichts verlieren)
    const keys = new Set(MULTI);
    Object.keys(startBadges).forEach(k => keys.add(k));

    const lvl = {};
    keys.forEach(k => { lvl[k] = startBadges[k] || 0; });

    // Saison-2026-Badges überlagern (max)
    let season = p.badges;
    if (!Array.isArray(season)) season = season && typeof season === "object" ? Object.values(season) : [];
    season.forEach(bd => {
      const id = bd && bd.badge_id;
      if (!id || !lvl.hasOwnProperty(id)) return; // nur Multi-Level
      const L = levelOf(bd);
      if (L > lvl[id]) lvl[id] = L;
    });

    // sortiert ausgeben
    const ordered = {};
    Object.keys(lvl).sort().forEach(k => { ordered[k] = lvl[k]; });
    out.pilots[uid] = { name: p.name || p.userName || ("Pilot " + uid), badges: ordered };
  });

  // --- Selbstprüfung gegen die beiden bekannten Screenshots ---
  console.log("\n🔎 Selbstprüfung gegen bekannte Soll-Stände:");
  let problems = 0;
  Object.entries(EXPECTED).forEach(([uid, exp]) => {
    const got = out.pilots[uid];
    if (!got) { console.warn(`  ⚠️ Pilot ${uid} nicht in Export gefunden`); problems++; return; }
    console.log(`  — ${got.name} (${uid}):`);
    Object.entries(exp).forEach(([b, want]) => {
      const have = got.badges[b] || 0;
      const ok = have >= want;
      if (!ok) problems++;
      console.log(`      ${ok ? "✅" : "❌"} ${b}: erwartet ≥${want}, berechnet ${have}`);
    });
    // Johannes-Spezialfall: always_by_your_side darf NICHT aus der Saison stammen
    if (uid === "29951") {
      const abys = got.badges.always_by_your_side || 0;
      console.log(`      ℹ️ always_by_your_side = ${abys} (nur aus Baseline erlaubt, nicht aus Saison 2026)`);
    }
  });
  console.log(problems === 0
    ? "✅ Selbstprüfung bestanden – alle bekannten Werte stimmen."
    : `⚠️ ${problems} Abweichung(en) – bitte prüfen, ob Saison 2026 vollständig geladen war.`);

  // --- Download ---
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "historical-badges-2026.json"; a.click();
  URL.revokeObjectURL(url);
  console.log(`\n💾 historical-badges-2026.json heruntergeladen (${Object.keys(out.pilots).length} Piloten).`);
  window.__historical2026 = out; // zum Nachsehen in der Konsole
})();
