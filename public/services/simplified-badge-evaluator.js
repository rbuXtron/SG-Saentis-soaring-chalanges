// /public/js/services/simplified-badge-evaluator.js
import { MULTI_LEVEL_BADGE_IDS } from './multi-level-badge-evaluator.js';
import { dataLoadingManager } from './data-loading-manager.js';

// Cache für historische Daten
let historicalBadgeData = null;

/**
 * Lädt die historischen Badge-Daten
 */
async function loadHistoricalBadgeData() {
    if (historicalBadgeData) return historicalBadgeData;

    try {
        // Korrekter Pfad relativ zum public Ordner
        const response = await fetch('./data/historical-badges-2024.json');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();

        // Versuche JSON zu parsen
        try {
            historicalBadgeData = JSON.parse(text);
            console.log('✅ Historische Badge-Daten geladen:', historicalBadgeData.metadata);
            return historicalBadgeData;
        } catch (parseError) {
            console.error('❌ JSON Parse Error:', parseError);
            console.error('Response text:', text.substring(0, 100) + '...');
            throw new Error('Invalid JSON in historical badge data');
        }

    } catch (error) {
        console.error('❌ Fehler beim Laden der historischen Badge-Daten:', error);

        // Fallback auf leere Struktur
        return {
            metadata: {
                error: error.message,
                fallback: true
            },
            pilots: {},
            badgeDefinitions: {}
        };
    }
}

/**
 * Vereinfachte Badge-Berechnung mit historischen Daten
 */
export async function calculateUserSeasonBadgesSimplified(userId, userName) {
    console.log(`\n👤 Verarbeite ${userName} (ID: ${userId}) - VEREINFACHT`);

    try {
        const SEASON_START = new Date('2024-10-01T00:00:00');
        const SEASON_END = new Date('2025-09-30T23:59:59');

        // Lade historische Daten
        const historical = await loadHistoricalBadgeData();

        // Prüfe ob Struktur korrekt ist
        let userHistoricalBadges = {};
        if (historical.pilots && historical.pilots[userId]) {
            userHistoricalBadges = historical.pilots[userId].badges || {};
            console.log(`  → Historische Daten gefunden für ${historical.pilots[userId].name}`);
        } else {
            console.log(`  → Keine historischen Daten für User ${userId}`);
        }

        // Lade aktuelle Achievements
        const achievements = await dataLoadingManager.loadUserAchievements(userId);

        // Filtere Season Badges
        const seasonBadges = achievements.filter(badge => {
            const createdDate = new Date(badge.created);
            return createdDate >= SEASON_START && createdDate <= SEASON_END;
        });

        console.log(`  → ${seasonBadges.length} Badges in Saison 2024/2025`);
        console.log(`  → Historische Badges: ${Object.keys(userHistoricalBadges).length}`);

        // Verarbeite Badges
        const processedBadges = [];

        seasonBadges.forEach(badge => {
            const isMultiLevel = MULTI_LEVEL_BADGE_IDS.includes(badge.badge_id);

            if (isMultiLevel) {
                // Multi-Level Badge
                const currentPoints = badge.points || 0;
                const historicalPoints = userHistoricalBadges[badge.badge_id] || 0;
                const seasonPoints = Math.max(0, currentPoints - historicalPoints);

                console.log(`  📊 ${badge.badge_id}: ${currentPoints} aktuell - ${historicalPoints} historisch = ${seasonPoints} Season-Punkte`);

                processedBadges.push({
                    ...badge,
                    seasonPoints,
                    currentPoints,
                    historicalPoints,
                    isNewInSeason: historicalPoints === 0,
                    type: 'multi-level',
                    verified: true
                });
            } else {
                // Single-Level Badge
                processedBadges.push({
                    ...badge,
                    seasonPoints: 1,
                    type: 'single-level',
                    verified: true
                });
            }
        });

        // Berechne Statistiken
        const totalSeasonPoints = processedBadges.reduce((sum, b) => sum + b.seasonPoints, 0);
        const multiLevelCount = processedBadges.filter(b => b.type === 'multi-level').length;
        const singleLevelCount = processedBadges.filter(b => b.type === 'single-level').length;

        console.log(`  ✅ ${userName}: ${totalSeasonPoints} Season-Punkte total`);

        return {
            userId,
            userName,
            badges: processedBadges,
            seasonBadges: processedBadges,
            badgeCount: totalSeasonPoints,
            seasonBadgeCount: totalSeasonPoints,
            badgeCategoryCount: new Set(processedBadges.map(b => b.badge_id)).size,
            multiLevelCount,
            singleLevelCount,
            historicalBadgesFound: Object.keys(userHistoricalBadges).length,
            // NEU: Kompatibilitäts-Felder
            flightsAnalyzed: seasonBadges.length,
            flightsInSeason: seasonBadges.length,
            flightsWithBadges: seasonBadges.length > 0 ? Math.min(seasonBadges.length, Math.max(1, Math.floor(totalSeasonPoints * 0.7))) : 0,
            // Weitere Statistiken
            totalBadges: achievements.length,
            allTimeBadges: achievements,
            seasonBadgePoints: processedBadges.reduce((sum, b) => sum + (b.points || 0), 0),
            allTimeBadgePoints: achievements.reduce((sum, b) => sum + (b.points || 0), 0),
            verifiedBadgeCount: processedBadges.length
        };

    } catch (error) {
        console.error(`  ❌ Fehler bei ${userName}:`, error);
        return createEmptyResult(userId, userName);
    }
}

// Helper-Funktion
function createEmptyResult(userId, userName) {
    return {
        userId,
        userName,
        badges: [],
        seasonBadges: [],
        badgeCount: 0,
        seasonBadgeCount: 0,
        badgeCategoryCount: 0,
        multiLevelCount: 0,
        singleLevelCount: 0,
        historicalBadgesFound: 0,
        flightsAnalyzed: 0,
        flightsInSeason: 0,
        flightsWithBadges: 0,
        totalBadges: 0,
        allTimeBadges: [],
        seasonBadgePoints: 0,
        allTimeBadgePoints: 0,
        verifiedBadgeCount: 0
    };
}

// Export für Integration
export default calculateUserSeasonBadgesSimplified;

// Debug-Funktion
export async function debugHistoricalData() {
    const data = await loadHistoricalBadgeData();
    console.log('📊 Historische Badge-Daten:', data);

    if (data.pilots) {
        console.log(`Anzahl Piloten: ${Object.keys(data.pilots).length}`);

        // Zeige erste 5 Piloten
        Object.entries(data.pilots).slice(0, 5).forEach(([userId, pilot]) => {
            console.log(`- ${pilot.name} (${userId}): ${Object.keys(pilot.badges).length} Badges`);
        });
    }
}