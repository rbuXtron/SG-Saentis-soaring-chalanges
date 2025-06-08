// services/optimized-badge-evaluator-v3.js
import { MULTI_LEVEL_BADGE_IDS } from './multi-level-badge-evaluator.js';
import { dataLoadingManager } from './data-loading-manager.js';

/**
 * Badge-Definitionen mit Wert-Mappings für Multi-Level Badges
 * Definiert welches Feld im Flug für welchen Badge relevant ist
 */
const BADGE_VALUE_MAPPINGS = {
    // Distanz-Badges (in km)
    'distance_hunter': {
        field: 'contest.distance',
        levels: [50, 100, 200, 500, 1000],
        points: [1, 2, 3, 5, 8],
        unit: 'km'
    },
    'explorer': {
        field: 'contest.distance',
        levels: [50, 100, 250, 500, 750, 1000],
        points: [1, 1, 2, 3, 4, 5],
        unit: 'km'
    },
    'no_need_to_circle': {
        field: 'contest.straight_distance',
        levels: [50, 100, 200, 300, 500],
        points: [1, 2, 3, 4, 5],
        unit: 'km'
    },
    'pythagoras': {
        field: 'contest.distance',
        levels: [100, 200, 300, 500, 750],
        points: [1, 2, 3, 4, 5],
        unit: 'km'
    },
    'zugvogel': {
        field: 'contest.distance',
        levels: [300, 500, 750, 1000, 1500],
        points: [1, 2, 3, 4, 5],
        unit: 'km'
    },
    
    // Höhen-Badges (in Metern)
    'astronaut': {
        field: 'contest.max_altitude',
        levels: [3000, 4000, 5000, 6000, 7000, 8000],
        points: [1, 2, 3, 4, 5, 6],
        unit: 'm'
    },
    
    // Dauer-Badges (in Sekunden)
    'aeronaut': {
        field: 'contest.duration',
        levels: [3600, 7200, 10800, 14400, 18000], // 1h, 2h, 3h, 4h, 5h
        points: [1, 2, 3, 4, 5],
        unit: 's',
        display: 'hours'
    },
    'endurance': {
        field: 'contest.duration',
        levels: [7200, 10800, 14400, 18000, 21600], // 2h, 3h, 4h, 5h, 6h
        points: [1, 2, 3, 4, 5],
        unit: 's',
        display: 'hours'
    },
    
    // Geschwindigkeits-Badges (in km/h)
    'sprinter': {
        field: 'contest.speed',
        levels: [60, 80, 100, 120, 140],
        points: [1, 2, 3, 4, 5],
        unit: 'km/h'
    },
    
    // Punkte-Badges
    'point_hunter': {
        field: 'contest.points',
        levels: [100, 200, 300, 400, 500],
        points: [1, 2, 3, 4, 5],
        unit: 'pts'
    },
    'walk_of_fame': {
        field: 'contest.points',
        levels: [50, 100, 150, 200, 300],
        points: [1, 2, 3, 4, 5],
        unit: 'pts'
    }
};

/**
 * Extrahiert einen Wert aus einem Flug-Objekt basierend auf einem Pfad
 */
function getFieldValue(flight, fieldPath) {
    if (!flight || !fieldPath) return 0;
    
    const parts = fieldPath.split('.');
    let value = flight;
    
    for (const part of parts) {
        value = value?.[part];
        if (value === undefined || value === null) return 0;
    }
    
    return Number(value) || 0;
}

/**
 * Berechnet die erreichten Punkte basierend auf dem Wert
 */
function calculatePointsForValue(value, config) {
    if (!config || !value) return 0;
    
    let totalPoints = 0;
    for (let i = 0; i < config.levels.length; i++) {
        if (value >= config.levels[i]) {
            totalPoints += config.points[i];
        } else {
            break;
        }
    }
    
    return totalPoints;
}

/**
 * Findet das höchste erreichte Level für einen Wert
 */
function findAchievedLevel(value, levels) {
    let achievedLevel = 0;
    
    for (let i = 0; i < levels.length; i++) {
        if (value >= levels[i]) {
            achievedLevel = i + 1;
        } else {
            break;
        }
    }
    
    return achievedLevel;
}

/**
 * Berechnet Multi-Level Badge Punkte basierend auf Flugwerten
 */
async function calculateMultiLevelBadgeFromFlights(badge, allFlights, seasonStart) {
    const config = BADGE_VALUE_MAPPINGS[badge.badge_id];
    
    if (!config) {
        console.log(`    ⚠️ Keine Wert-Definition für ${badge.badge_id} - verwende Badge-Punkte direkt`);
        return {
            ...badge,
            seasonPoints: badge.points || 0,
            preSeasonPoints: 0,
            foundPreSeason: false,
            verified: true,
            type: 'multi-level',
            verificationMethod: 'no-mapping'
        };
    }
    
    // Separiere Flüge vor und nach Saisonstart
    const flightsBeforeSeason = [];
    const flightsInSeason = [];
    
    allFlights.forEach(flight => {
        const flightDate = new Date(flight.date || flight.scoring_date || flight.takeoff_time);
        if (flightDate < seasonStart) {
            flightsBeforeSeason.push(flight);
        } else {
            flightsInSeason.push(flight);
        }
    });
    
    // Finde Maximalwerte
    let maxValueBeforeSeason = 0;
    let maxValueInSeason = 0;
    let bestFlightBefore = null;
    let bestFlightInSeason = null;
    
    // Vor der Saison
    flightsBeforeSeason.forEach(flight => {
        const value = getFieldValue(flight, config.field);
        if (value > maxValueBeforeSeason) {
            maxValueBeforeSeason = value;
            bestFlightBefore = flight;
        }
    });
    
    // In der Saison
    flightsInSeason.forEach(flight => {
        const value = getFieldValue(flight, config.field);
        if (value > maxValueInSeason) {
            maxValueInSeason = value;
            bestFlightInSeason = flight;
        }
    });
    
    // Berechne Punkte
    const pointsBeforeSeason = calculatePointsForValue(maxValueBeforeSeason, config);
    const pointsInSeason = calculatePointsForValue(maxValueInSeason, config);
    const seasonPoints = Math.max(0, pointsInSeason - pointsBeforeSeason);
    
    // Finde erreichte Level
    const levelBeforeSeason = findAchievedLevel(maxValueBeforeSeason, config.levels);
    const levelInSeason = findAchievedLevel(maxValueInSeason, config.levels);
    
    console.log(`    📊 ${badge.badge_id} (${config.unit}):`);
    console.log(`       Vor Saison: ${maxValueBeforeSeason}${config.unit} → Level ${levelBeforeSeason} (${pointsBeforeSeason} Punkte)`);
    console.log(`       In Saison: ${maxValueInSeason}${config.unit} → Level ${levelInSeason} (${pointsInSeason} Punkte)`);
    console.log(`       → Season-Punkte: ${seasonPoints}`);
    
    return {
        ...badge,
        seasonPoints,
        preSeasonPoints: pointsBeforeSeason,
        foundPreSeason: maxValueBeforeSeason > 0,
        verified: true,
        type: 'multi-level',
        verificationMethod: 'value-based',
        maxValueBeforeSeason,
        maxValueInSeason,
        levelBeforeSeason,
        levelInSeason,
        bestFlightBefore: bestFlightBefore ? {
            id: bestFlightBefore.id,
            date: bestFlightBefore.date || bestFlightBefore.scoring_date,
            value: maxValueBeforeSeason
        } : null,
        bestFlightInSeason: bestFlightInSeason ? {
            id: bestFlightInSeason.id,
            date: bestFlightInSeason.date || bestFlightInSeason.scoring_date,
            value: maxValueInSeason
        } : null,
        flightsAnalyzed: {
            beforeSeason: flightsBeforeSeason.length,
            inSeason: flightsInSeason.length
        }
    };
}

/**
 * Optimierte Version die direkt mit Flugwerten arbeitet
 */
export async function calculateUserSeasonBadgesOptimized(userId, userName, historicalFlights = null, currentSeasonFlights = null) {
    console.log(`\n👤 Verarbeite ${userName} (ID: ${userId}) - OPTIMIERT V3 (Value-Based)`);

    try {
        const SEASON_START = new Date('2024-10-01T00:00:00');
        const SEASON_END = new Date('2025-09-30T23:59:59');

        // Nutze den zentralen Manager für Achievements
        const achievements = await dataLoadingManager.loadUserAchievements(userId);

        // Filtere Season Badges
        const seasonBadges = achievements.filter(badge => {
            const createdDate = new Date(badge.created);
            return createdDate >= SEASON_START && createdDate <= SEASON_END;
        });

        console.log(`  → ${seasonBadges.length} Badges in Saison 2024/2025`);

        // Kombiniere alle Flüge für die Analyse
        const allFlights = [...(historicalFlights || []), ...(currentSeasonFlights || [])];
        console.log(`  → ${allFlights.length} Flüge gesamt für Analyse`);

        // Badge-Verarbeitung
        const multiLevelBadgeMap = new Map();
        const singleLevelBadges = [];

        seasonBadges.forEach(badge => {
            if (isConfiguredMultiLevelBadge(badge.badge_id)) {
                if (!multiLevelBadgeMap.has(badge.badge_id)) {
                    multiLevelBadgeMap.set(badge.badge_id, []);
                }
                multiLevelBadgeMap.get(badge.badge_id).push(badge);
            } else {
                singleLevelBadges.push(badge);
            }
        });

        // Verarbeite Badges
        const processedBadges = [];

        // Single-Level Badges
        singleLevelBadges.forEach(badge => {
            processedBadges.push({
                ...badge,
                seasonPoints: 1,
                verified: true,
                type: 'single-level',
                foundPreSeason: false,
                preSeasonPoints: 0
            });
        });

        // Multi-Level Badges mit Value-Based Calculation
        if (multiLevelBadgeMap.size > 0 && allFlights.length > 0) {
            console.log(`  → Analysiere ${multiLevelBadgeMap.size} Multi-Level Badges mit Flugwerten`);
            
            for (const [badgeId, badges] of multiLevelBadgeMap) {
                // Nehme den Badge mit den höchsten Punkten
                const currentBadge = badges.reduce((max, badge) =>
                    (badge.points || 0) > (max.points || 0) ? badge : max
                );
                
                // Berechne basierend auf Flugwerten
                const result = await calculateMultiLevelBadgeFromFlights(
                    currentBadge,
                    allFlights,
                    SEASON_START
                );
                
                processedBadges.push(result);
            }
        } else if (multiLevelBadgeMap.size > 0) {
            // Fallback wenn keine Flüge vorhanden
            console.log(`  ⚠️ Keine Flüge für Value-Based Calculation - verwende Badge-Punkte direkt`);
            
            for (const [badgeId, badges] of multiLevelBadgeMap) {
                const currentBadge = badges.reduce((max, badge) =>
                    (badge.points || 0) > (max.points || 0) ? badge : max
                );
                
                processedBadges.push({
                    ...currentBadge,
                    seasonPoints: currentBadge.points || 0,
                    preSeasonPoints: 0,
                    foundPreSeason: false,
                    verified: true,
                    type: 'multi-level',
                    verificationMethod: 'direct-points'
                });
            }
        }

        // Berechne finale Statistiken
        const totalSeasonPoints = processedBadges.reduce((sum, b) => sum + b.seasonPoints, 0);
        const totalSeasonBadgePoints = seasonBadges.reduce((sum, b) => sum + (b.points || 0), 0);
        const totalAllTimeBadgePoints = achievements.reduce((sum, b) => sum + (b.points || 0), 0);
        const verifiedBadgeCount = processedBadges.filter(b => b.verified).length;

        console.log(`  ✅ ${userName}: ${totalSeasonPoints} Season-Punkte (value-based), ${totalAllTimeBadgePoints} Badge-Punkte gesamt`);

        return {
            userId,
            userName,
            badges: processedBadges,
            seasonBadges: processedBadges,
            badgeCount: totalSeasonPoints,
            seasonBadgeCount: totalSeasonPoints,
            badgeCategoryCount: new Set(processedBadges.map(b => b.badge_id)).size,
            flightsAnalyzed: historicalFlights?.length || 0,
            flightsInSeason: currentSeasonFlights?.length || 0,
            flightsWithBadges: seasonBadges.length > 0 ?
                new Set(seasonBadges.map(b => b.flight_id).filter(id => id)).size : 0,
            // Badge-Punkte Summen
            seasonBadgePoints: totalSeasonBadgePoints,
            allTimeBadgePoints: totalAllTimeBadgePoints,
            verifiedBadgeCount: verifiedBadgeCount,
            // Weitere Felder
            totalBadges: achievements.length,
            seasonBadgesCount: seasonBadges.length,
            multiLevelCount: multiLevelBadgeMap.size,
            singleLevelCount: singleLevelBadges.length,
            allTimeBadges: achievements,
            allTimeBadgeCount: achievements.length
        };

    } catch (error) {
        console.error(`  ❌ Fehler bei ${userName}:`, error);
        return createEmptyResult(userId, userName);
    }
}

// Helper-Funktionen
function isConfiguredMultiLevelBadge(badgeId) {
    if (!badgeId) return false;
    return MULTI_LEVEL_BADGE_IDS.some(id =>
        badgeId.toLowerCase().includes(id.toLowerCase())
    );
}

function createEmptyResult(userId, userName) {
    return {
        userId,
        userName,
        badges: [],
        seasonBadges: [],
        badgeCount: 0,
        seasonBadgeCount: 0,
        badgeCategoryCount: 0,
        flightsAnalyzed: 0,
        flightsInSeason: 0,
        flightsWithBadges: 0,
        seasonBadgePoints: 0,
        allTimeBadgePoints: 0,
        verifiedBadgeCount: 0,
        totalBadges: 0,
        seasonBadgesCount: 0,
        multiLevelCount: 0,
        singleLevelCount: 0,
        allTimeBadges: [],
        allTimeBadgeCount: 0
    };
}

// Export für Debug-Zwecke
export { BADGE_VALUE_MAPPINGS };

// Debug-Funktion zum Testen
export async function testBadgeCalculation(userId, userName) {
    console.log('\n🧪 Teste Value-Based Badge Calculation');
    console.log('=====================================');
    
    // Lade Flugdaten
    const { apiClient } = await import('./weglide-api-service.js');
    
    const currentYear = new Date().getFullYear();
    const flights2025 = await apiClient.fetchUserFlights(userId, currentYear);
    const flights2024 = await apiClient.fetchUserFlights(userId, currentYear - 1);
    const flights2023 = await apiClient.fetchUserFlights(userId, currentYear - 2);
    
    const allFlights = [...flights2023, ...flights2024, ...flights2025];
    const currentSeasonFlights = flights2025;
    
    console.log(`\nGeladene Flüge:`);
    console.log(`2023: ${flights2023.length}`);
    console.log(`2024: ${flights2024.length}`);
    console.log(`2025: ${flights2025.length}`);
    console.log(`Gesamt: ${allFlights.length}`);
    
    // Teste die Berechnung
    const result = await calculateUserSeasonBadgesOptimized(
        userId,
        userName,
        allFlights,
        currentSeasonFlights
    );
    
    console.log('\n📊 Ergebnis:');
    console.log(`Season-Punkte: ${result.badgeCount}`);
    console.log(`Multi-Level Badges: ${result.multiLevelCount}`);
    console.log(`Single-Level Badges: ${result.singleLevelCount}`);
    
    // Zeige Details für Multi-Level Badges
    const multiLevelBadges = result.badges.filter(b => b.type === 'multi-level');
    if (multiLevelBadges.length > 0) {
        console.log('\n🏅 Multi-Level Badge Details:');
        multiLevelBadges.forEach(badge => {
            console.log(`\n${badge.badge_id}:`);
            console.log(`  Season-Punkte: ${badge.seasonPoints}`);
            console.log(`  Max vor Saison: ${badge.maxValueBeforeSeason || 0}`);
            console.log(`  Max in Saison: ${badge.maxValueInSeason || 0}`);
            console.log(`  Level: ${badge.levelBeforeSeason || 0} → ${badge.levelInSeason || 0}`);
        });
    }
    
    return result;
}