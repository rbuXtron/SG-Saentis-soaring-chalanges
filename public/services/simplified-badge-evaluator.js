// /public/js/services/simplified-badge-evaluator.js
import { MULTI_LEVEL_BADGE_IDS } from './multi-level-badge-evaluator.js';
import { dataLoadingManager } from './data-loading-manager.js';

// Cache für historische Daten
let historicalBadgeData = null;
let historicalBadgeDataCache = new Map();

const SEASON_START = new Date('2024-10-01T00:00:00');
const SEASON_END = new Date('2025-09-30T23:59:59');

/**
 * Lädt die historischen Badge-Daten
 */
async function loadHistoricalBadgeData(season = '2025') {
    // Debug-Ausgabe hinzufügen
    console.log(`📁 Versuche historische Badge-Daten für Saison ${season} zu laden...`);

    const fileMap = {
        '2025': './data/historical-badges-2024.json',
        '2026': './data/historical-badges-2025.json'
    };

    const filePath = fileMap[season];
    console.log(`📂 Dateipfad: ${filePath}`);

    try {
        const response = await fetch(filePath);
        console.log(`📡 Response Status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`✅ Daten geladen:`, data.metadata);
        return data;
    } catch (error) {
        console.error(`❌ Fehler beim Laden:`, error);
        return createEmptyHistoricalData();
    }
}

/**
 * Vereinfachte Badge-Berechnung mit historischen Daten
 */
export async function calculateUserSeasonBadgesSimplified(userId, userName, season = '2025') {
    console.log(`\n🔍 DEBUG Badge-Berechnung für ${userName} (${userId}), Saison ${season}`);

    try {
        // Saison-Konfiguration
        const seasonConfig = {
            '2025': {
                start: new Date('2024-10-01T00:00:00'),
                end: new Date('2025-09-30T23:59:59'),
                label: '2024/2025'
            },
            '2026': {
                start: new Date('2025-10-01T00:00:00'),
                end: new Date('2026-09-30T23:59:59'),
                label: '2025/2026'
            }
        };

        const config = seasonConfig[season] || seasonConfig['2025'];
        console.log(`  📅 Zeitraum: ${config.start.toLocaleDateString()} - ${config.end.toLocaleDateString()}`);

        // Lade historische Daten
        const historical = await loadHistoricalBadgeData(season);
        console.log(`  📚 Historische Daten geladen:`, historical ? 'Ja' : 'Nein');

        // Lade aktuelle Achievements
        console.log(`  🔄 Lade Achievements für User ${userId}...`);
        const achievements = await dataLoadingManager.loadUserAchievements(userId);
        console.log(`  📊 ${achievements.length} Achievements insgesamt gefunden`);

        // Filtere nach Saison
        const seasonBadges = achievements.filter(badge => {
            if (!badge.created) {
                console.warn(`    ⚠️ Badge ohne created-Datum:`, badge);
                return false;
            }
            const createdDate = new Date(badge.created);
            const inSeason = createdDate >= config.start && createdDate <= config.end;
            if (inSeason) {
                console.log(`    ✅ Badge ${badge.badge_id} vom ${createdDate.toLocaleDateString()} ist in Saison`);
            }
            return inSeason;
        });

        console.log(`  🎯 ${seasonBadges.length} Badges in Saison ${config.label}`);

        // Verarbeite Badges
        const processedBadges = [];
        // ... Rest der Verarbeitung

        return {
            userId,
            userName,
            badges: processedBadges,
            seasonBadges: seasonBadges,
            badgeCount: seasonBadges.length,
            // ... andere Felder
        };

    } catch (error) {
        console.error(`❌ Fehler bei Badge-Berechnung für ${userName}:`, error);
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