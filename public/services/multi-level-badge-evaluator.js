
// Konfigurierbare Liste von Multi-Level Badge IDs
const MULTI_LEVEL_BADGE_IDS = [
    // Höhen-Badges
    'astronaut',        // Höhe in Metern


    // Distanz-Badges
    'explorer',         // Gesamtdistanz
    'no_need_to_circle', // Geradeaus-Distanz
    'pythagoras',    // Rückkehr zum Startplatz
    'zugvogel',         // Migration/Langstrecke
    'euclid',

    // Dauer-Badges
    'aeronaut',         // Flugdauer
    'endurance',        // Ausdauer

    // Geschwindigkeits-Badges
    'sprinter',         // Durchschnittsgeschwindigkeit

    // Punkte-Badges
    'point_hunter',
    'walk_of_fame',

    // Konsistenz-Badges
    'consistency',      // Regelmäßigkeit
    'segment_specialist',
    'vintage_viper',
    'sky_streak',


    // Team-Badges
    'cockpit_crew',     // Co-Pilot Flüge
    'always_by_your_side', // Häufiger Co-Pilot

    // Reise-Badges
    'aircraft_hopper',  // Verschiedene Flugzeuge
    'nomad',            // Verschiedene Startplätze
    'tourist',          // Verschiedene Länder
    'flying_in_circles',
    'globe_trotter',
    'training_lap',
    'day_winner'
];

/**
 * Lädt historische Badge-Daten aus JSONMULTI_LEVEL_BADGE_IDS
 */
async function loadHistoricalBadgeData(seasonYear) {
    const fileMap = {
        2025: './data/historical-badges-2024.json',
        2026: './data/historical-badges-2025.json'
    };

    try {
        const response = await fetch(fileMap[seasonYear] || fileMap[2025]);
        if (response.ok) {
            const data = await response.json();
            console.log(`✅ Historische Daten geladen: ${Object.keys(data.pilots || {}).length} Piloten`);
            return data;
        }
    } catch (error) {
        console.error('❌ Fehler beim Laden historischer Badges:', error);
    }
    return { pilots: {} };
}

/**
 * Verifiziert Multi-Level Badge mit JSON-Daten
 */
export async function verifyMultiLevelBadgeSelective(badge, historicalData, userId) {
    console.log(`\n  🔍 Badge-Verifikation für: ${badge.badge_id}`);
    console.log(`     User ID: ${userId}`);
    console.log(`     Badge-Daten:`, {
        badge_id: badge.badge_id,
        points: badge.points,
        values: badge.values,
        created: badge.created
    });

    const isMultiLevel = MULTI_LEVEL_BADGE_IDS.includes(badge.badge_id);
    console.log(`     Ist Multi-Level: ${isMultiLevel}`);

    const currentPoints = badge.points || badge.values?.length || 1;
    console.log(`Badge ${badge.badge_id}: ${currentPoints} Punkte total von API`);

    if (!isMultiLevel) {
        console.log(`     → Single-Level Badge, vergebe 1 Punkt`);
        return {
            ...badge,
            seasonPoints: 1,
            preSeasonPoints: 0,
            foundPreSeason: false,
            verified: true,
            type: 'single-level'
        };
    }

    // Multi-Level Badge Verifikation
    let preSeasonPoints = 0;
    let foundPreSeason = false;

    console.log(`     📂 Prüfe historische Daten...`);

    // Debug: Struktur der historischen Daten
    if (!historicalData) {
        console.log(`     ❌ Keine historischen Daten vorhanden`);
    } else if (!historicalData.pilots) {
        console.log(`     ❌ Keine Piloten in historischen Daten`);
    } else if (!historicalData.pilots[userId]) {
        console.log(`     ⚠️ User ${userId} nicht in historischen Daten gefunden`);
    } else if (!historicalData.pilots[userId].badges) {
        console.log(`     ⚠️ User hat keine historischen Badges`);
    } else {
        console.log(`     ✅ User hat ${Object.keys(historicalData.pilots[userId].badges).length} historische Badges`);

        // Liste alle historischen Badges für diesen User
        const historicalBadgeIds = Object.keys(historicalData.pilots[userId].badges);
        console.log(`     Historische Badge IDs:`, historicalBadgeIds.slice(0, 5), '...');
    }

    // Suche spezifisches Badge in JSON-Daten
    if (historicalData?.pilots?.[userId]?.badges?.[badge.badge_id]) {
       const historicalPoints = historicalData.pilots[userId].badges[badge.badge_id];
        
        console.log(`     🎯 Badge ${badge.badge_id} in Historie gefunden: ${historicalPoints} Punkte`);
        
        preSeasonPoints = historicalPoints;  // Direkt die Zahl verwenden
        foundPreSeason = true;

        console.log(`     📊 Historische Punkte: ${preSeasonPoints}`);
    } else {
        console.log(`     ℹ️ Badge ${badge.badge_id} NICHT in Historie gefunden - erste Erreichung`);
    }

    // Berechne Season-Punkte
    //const currentPoints = badge.points || badge.values?.length || 1;
    const seasonPoints = Math.max(0, currentPoints - preSeasonPoints);

    console.log(`     📈 Punkteberechnung:`);
    console.log(`        Aktuelle Punkte: ${currentPoints}`);
    console.log(`        Historische Punkte: ${preSeasonPoints}`);
    console.log(`        Season-Punkte: ${seasonPoints} (${currentPoints} - ${preSeasonPoints})`);

    const result = {
        ...badge,
        seasonPoints,
        preSeasonPoints,
        foundPreSeason,
        verified: true,
        type: 'multi-level',
        verificationMethod: foundPreSeason ? 'json-data' : 'first-time'
    };

    console.log(`     ✅ Verifikation abgeschlossen für ${badge.badge_id}`);

    return result;
}

/**
 * Hauptfunktion für Badge-Berechnung
 */
export async function calculateUserSeasonBadgesWithConfig(userId, userName, historicalFlights = null, currentSeasonFlights = null, seasonYear = 2025) {
    console.log(`\n👤 Verarbeite ${userName} (ID: ${userId}) für Saison ${seasonYear}`);

    try {
        // Saison-Zeiträume
        const SEASON_START = new Date(`${seasonYear - 1}-10-01T00:00:00`);
        const SEASON_END = new Date(`${seasonYear}-09-30T23:59:59`);
        const seasonLabel = `${seasonYear - 1}/${seasonYear}`;

        // 1. Lade historische Daten aus JSON
        const historicalData = await loadHistoricalBadgeData(seasonYear);

        // 2. Lade aktuelle Achievements von API
        const achievements = await loadUserAchievements(userId);

        let allTimePoints = 0;
        achievements.forEach(badge => {
            // badge.points = Anzahl erreichter Level
            allTimePoints += badge.points || 1;
        });
        console.log(`  📊 Gesamt-Punkte (alle Zeit): ${allTimePoints}`);

        // 3. Filtere Season Badges
        const seasonBadges = achievements.filter(badge => {
            if (!badge.created) return false;
            const createdDate = new Date(badge.created);
            return createdDate >= SEASON_START && createdDate <= SEASON_END;
        });

        console.log(`  → ${seasonBadges.length} Badges in Saison ${seasonLabel}`);

        // 4. Verarbeite alle Badges
        const processedBadges = [];

        for (const badge of seasonBadges) {
            const verifiedBadge = await verifyMultiLevelBadgeSelective(
                badge,
                historicalData,
                userId
            );
            processedBadges.push(verifiedBadge);
        }

        // 5. Berechne Statistiken
        const totalSeasonPoints = processedBadges.reduce((sum, b) => sum + b.seasonPoints, 0);
        const multiLevelBadges = processedBadges.filter(b => b.type === 'multi-level');
        const singleLevelBadges = processedBadges.filter(b => b.type === 'single-level');

        console.log(`  ✅ ${userName}: ${totalSeasonPoints} Season-Punkte`);
        console.log(`     Multi-Level: ${multiLevelBadges.length}, Single-Level: ${singleLevelBadges.length}`);

        return {
            userId,
            userName,
            badges: processedBadges,
            seasonBadges: processedBadges,

            // Punkte-Zählungen
            badgeCount: totalSeasonPoints,  // Season-Punkte für Ranking
            seasonBadgeCount: totalSeasonPoints,
            allTimeBadgeCount: allTimePoints,  // Gesamt-Anzahl Badges

            // Kategorien und Typen
            badgeCategoryCount: new Set(processedBadges.map(b => b.badge_id)).size,
            multiLevelCount: multiLevelBadges.length,
            singleLevelCount: singleLevelBadges.length,

            // Flug-Statistiken
            flightsAnalyzed: historicalFlights?.length || 0,
            flightsInSeason: currentSeasonFlights?.length || 0,
            flightsWithBadges: new Set(seasonBadges.map(b => b.flight_id).filter(Boolean)).size,

            // Weitere Daten
            processedBadges,
            verifiedBadgeCount: processedBadges.filter(b => b.verified).length,
            allTimeBadges: achievements
        };

    } catch (error) {
        console.error(`  ❌ Fehler bei ${userName}:`, error);
        return {
            userId,
            userName,
            badges: [],
            badgeCount: 0,
            seasonBadgeCount: 0,
            allTimeBadgeCount: 0,
            error: error.message
        };
    }
}

/**
 * Lädt User Achievements von API
 */
async function loadUserAchievements(userId) {
    try {
        const response = await fetch(`/api/proxy?path=achievement/user/${userId}`);
        if (!response.ok) throw new Error(`API Fehler: ${response.status}`);

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.warn(`  ⚠️ Konnte Achievements nicht laden:`, error.message);
        return [];
    }
}

/**
 * Prüft ob Badge Multi-Level ist
 */
export function isConfiguredMultiLevelBadge(badgeId) {
    return MULTI_LEVEL_BADGE_IDS.includes(badgeId);
}

// Exports
export {
    MULTI_LEVEL_BADGE_IDS,
    loadHistoricalBadgeData
};