// services/optimized-badge-evaluator.js
import { MULTI_LEVEL_BADGE_IDS } from './multi-level-badge-evaluator.js';
import { dataLoadingManager } from './data-loading-manager.js';

/**
 * Optimierte Version die den zentralen Data Loading Manager nutzt
 */
export async function calculateUserSeasonBadgesOptimized(userId, userName, historicalFlights = null, currentSeasonFlights = null) {
    console.log(`\n👤 Verarbeite ${userName} (ID: ${userId}) - OPTIMIERT V2`);
    
    try {
        const SEASON_START = new Date('2024-10-01T00:00:00');
        const SEASON_END = new Date('2025-09-30T23:59:59');
        const HISTORY_START = new Date('2023-06-01T00:00:00');
        const HISTORY_END = new Date('2024-09-30T23:59:59');
        
        // Nutze den zentralen Manager für Achievements
        const achievements = await dataLoadingManager.loadUserAchievements(userId);
        
        // Filtere Season Badges
        const seasonBadges = achievements.filter(badge => {
            const createdDate = new Date(badge.created);
            return createdDate >= SEASON_START && createdDate <= SEASON_END;
        });
        
        console.log(`  → ${seasonBadges.length} Badges in Saison 2024/2025`);
        
        // Badge-Verarbeitung wie vorher...
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
        
        // Multi-Level Badges mit optimiertem Flight Detail Loading
        if (multiLevelBadgeMap.size > 0 && historicalFlights && historicalFlights.length > 0) {
            // Sammle alle Flight IDs die wir prüfen müssen
            const flightIdsToCheck = historicalFlights
                .filter(flight => {
                    const flightDate = new Date(flight.date || flight.scoring_date || flight.takeoff_time);
                    return flightDate >= HISTORY_START && flightDate <= HISTORY_END;
                })
                .map(flight => flight.id || flight.rawData?.id)
                .filter(id => id)
                .slice(0, 100); // Limit
            
            console.log(`  → ${flightIdsToCheck.length} historische Flüge zu prüfen`);
            
            // Batch-Loading der Flight Details
            const flightDetailsMap = await dataLoadingManager.loadFlightDetailsBatch(flightIdsToCheck);
            
            console.log(`  → ${flightDetailsMap.size} Flugdetails geladen`);
            
            // Verarbeite die geladenen Details
            const historicalBadgePoints = new Map();
            
            flightDetailsMap.forEach((details, flightId) => {
                if (!details) return;
                
                let achievements = [];
                if (details.achievement) {
                    achievements = Array.isArray(details.achievement) ? 
                        details.achievement : [details.achievement];
                } else if (details.achievements) {
                    achievements = Array.isArray(details.achievements) ? 
                        details.achievements : [details.achievements];
                }
                
                achievements.forEach(achievement => {
                    const badgeId = achievement.badge_id || achievement.badge?.id;
                    
                    if (badgeId && multiLevelBadgeMap.has(badgeId)) {
                        const points = achievement.points || 0;
                        const currentMax = historicalBadgePoints.get(badgeId) || 0;
                        
                        if (points > currentMax) {
                            historicalBadgePoints.set(badgeId, points);
                        }
                    }
                });
            });
            
            // Berechne Season-Punkte
            for (const [badgeId, badges] of multiLevelBadgeMap) {
                const currentBadge = badges.reduce((max, badge) => 
                    badge.points > max.points ? badge : max
                );
                
                const historicalPoints = historicalBadgePoints.get(badgeId) || 0;
                const seasonPoints = Math.max(0, currentBadge.points - historicalPoints);
                
                processedBadges.push({
                    ...currentBadge,
                    seasonPoints,
                    preSeasonPoints: historicalPoints,
                    foundPreSeason: historicalPoints > 0,
                    verified: true,
                    type: 'multi-level',
                    verificationMethod: 'batch-loading'
                });
            }
        }
        
        // Berechne finale Statistiken
        const totalSeasonPoints = processedBadges.reduce((sum, b) => sum + b.seasonPoints, 0);
        
        console.log(`  ✅ ${userName}: ${totalSeasonPoints} Season-Punkte (optimiert)`);
        
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
            // Weitere Felder...
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
        flightsWithBadges: 0
    };
}