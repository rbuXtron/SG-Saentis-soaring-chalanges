// =====================================================================
//  Export season-badges-2026.json  —  im Browser-Console ausführen
// =====================================================================
//
//  WICHTIG — WO AUSFÜHREN:
//    Auf der DEPLOYTEN Seite  https://sgsaentiscup.vercel.app  (Saison 2026),
//    NICHT lokal! Lokal liest die App die (fehlerhafte) season-badges-2026.json
//    selbst — ein Export dort würde den Fehler nur reproduzieren. Deployed
//    rechnet live aus den Flugdaten und ist korrekt (= deine Screenshots).
//
//  WAS:  Schreibt die Vorberechnungs-Datei, die data-processor.js
//        (loadPrecomputedBadges) liest. Zählung nach 1-PUNKT-REGEL:
//        jeder Badge zählt genau 1 (Multi-Level wie Single-Level).
//        → seasonBadgeCount = badgeCount = badgeCategoryCount = Anzahl
//          verschiedener Badges.
//
//  NUTZUNG: Saison 2026 laden, Rangliste abwarten, dann diesen ganzen
//           Block in die Konsole einfügen. Datei wird heruntergeladen,
//           Konsole zeigt Selbstprüfung gegen Johannes (14) und Roman (15).
// =====================================================================

(function exportSeasonBadges2026() {
  const pilots = window.pilotData || (window.sgApp && window.sgApp.pilotData);
  if (!pilots || !pilots.length) {
    console.error("❌ Keine Pilotendaten (window.pilotData). Erst Saison 2026 laden!");
    return;
  }
  console.log(`📊 ${pilots.length} Piloten in window.pilotData`);

  // Multi-Level-Erkennung eines Badge-Eintrags
  function isMulti(bd) {
    if (!bd) return false;
    if (bd.type === "multi-level") return true;
    if (bd.is_multi_level === true) return true;
    const def = bd.badge;
    if (def && Array.isArray(def.values) && def.values.length > 1) return true;
    if (def && Array.isArray(def.points) && def.points.length > 1) return true;
    return false;
  }

  // Soll-Werte aus den beiden geprüften Screenshots (Selbstkontrolle)
  const EXPECTED = {
    "29951": { name: "Johannes Widmer", categories: 14, has: ["nomad", "cockpit_crew"], hasNot: ["always_by_your_side"] },
    "10518": { name: "Roman Andreas Buehler", categories: 15, has: ["always_by_your_side", "vintage_viper", "flying_in_circles"], hasNot: [] }
  };

  const out = {
    season: 2026,
    season_label: "2025/2026",
    generated: new Date().toISOString().slice(0, 16).replace("T", " "),
    pilots: {}
  };

  pilots.forEach(p => {
    const uid = String(p.userId);
    let badges = p.badges;
    if (!Array.isArray(badges)) badges = badges && typeof badges === "object" ? Object.values(badges) : [];

    const multiIds = new Set();
    const singleIds = new Set();
    badges.forEach(bd => {
      const id = bd && bd.badge_id;
      if (!id) return;
      if (isMulti(bd)) multiIds.add(id); else singleIds.add(id);
    });
    // Falls ein Badge sowohl als multi wie single auftaucht: als multi zählen
    singleIds.forEach(id => { if (multiIds.has(id)) singleIds.delete(id); });

    const distinct = multiIds.size + singleIds.size;

    out.pilots[uid] = {
      userId: p.userId,
      userName: p.name || p.userName || ("Pilot " + uid),
      badges: badges,                       // volle Einträge → Detail-Ansicht bleibt intakt
      seasonBadges: badges,
      seasonBadgeCount: distinct,           // 1-Punkt-Regel
      badgeCount: distinct,                 // 1-Punkt-Regel (Award-Zahl + Sortierung)
      allTimeBadgeCount: p.allTimeBadgeCount || 0,
      badgeCategoryCount: distinct,
      multiLevelCount: multiIds.size,
      singleLevelCount: singleIds.size,
      flightsWithBadges: p.flightsWithBadges || 0,
      flightsAnalyzed: p.flightsAnalyzed || 0
    };
  });

  // --- Selbstprüfung ---
  console.log("\n🔎 Selbstprüfung gegen bekannte Soll-Stände:");
  let problems = 0;
  Object.entries(EXPECTED).forEach(([uid, exp]) => {
    const g = out.pilots[uid];
    if (!g) { console.warn(`  ⚠️ ${exp.name} (${uid}) nicht gefunden`); problems++; return; }
    const ids = new Set(g.badges.map(b => b.badge_id));
    const okCat = g.badgeCategoryCount === exp.categories;
    if (!okCat) problems++;
    console.log(`  — ${g.name} (${uid}): Kategorien ${g.badgeCategoryCount} ${okCat ? "✅" : "❌ (erwartet " + exp.categories + ")"}  [${g.multiLevelCount} multi / ${g.singleLevelCount} single]`);
    exp.has.forEach(b => { const ok = ids.has(b); if (!ok) problems++; console.log(`        ${ok ? "✅" : "❌"} hat ${b}`); });
    exp.hasNot.forEach(b => { const bad = ids.has(b); if (bad) problems++; console.log(`        ${bad ? "❌ hat fälschlich" : "✅ hat NICHT"} ${b}`); });
  });
  console.log(problems === 0
    ? "✅ Selbstprüfung bestanden – auf der richtigen (deployten) Seite ausgeführt."
    : `⚠️ ${problems} Abweichung(en) – wurdest du evtl. LOKAL ausgeführt statt auf sgsaentiscup.vercel.app?`);

  // --- Download ---
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "season-badges-2026.json"; a.click();
  URL.revokeObjectURL(url);
  console.log(`\n💾 season-badges-2026.json heruntergeladen (${Object.keys(out.pilots).length} Piloten).`);
  window.__season2026 = out;
})();
