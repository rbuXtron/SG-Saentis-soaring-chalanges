/**
 * Optimized Multi-Level Badge Evaluator
 * Lädt Flugdetails nur einmal und prüft alle Badges gleichzeitig
 */

import { MULTI_LEVEL_BADGE_IDS } from './multi-level-badge-evaluator.js';

// Cache für Flugdetails
const flightDetailsCache = new Map();

/**
 * Optimierte Version die alle Multi-Level Badges auf einmal verarbeitet
 */
export async function calculateUserSeasonBadgesOptimized(userId, userName, historicalFlights = null, currentSeasonFlights = null) {
    console.log(`\n👤 Verarbeite ${userName} (ID: ${userId}) - OPTIMIERT`);
    console.log(`   Historische Flüge: ${historicalFlights?.length || 0}`);
    console.log(`   Season Flüge: ${currentSeasonFlights?.length || 0}`);
    
    try {
        const SEASON_START = new Date('2024-10-01T00:00:00');
        const SEASON_END = new Date('2025-09-30T23:59:59');
        const HISTORY_START = new Date('2023-06-01T00:00:00');
        const HISTORY_END = new Date('2024-09-30T23:59:59');
        
        // Lade alle Achievements des Users
        const achievements = await loadUserAchievements(userId);
        
        // Filtere Season Badges
        const seasonBadges = achievements.filter(badge => {
            const createdDate = new Date(badge.created);
            return createdDate >= SEASON_START && createdDate <= SEASON_END;
        });
        
        console.log(`  → ${seasonBadges.length} Badges in Saison 2024/2025`);
        
        // Gruppiere Badges nach Multi-Level und Single-Level
        const multiLevelBadgeMap = new Map(); // badge_id -> [badges]
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
        
        console.log(`  → ${multiLevelBadgeMap.size} verschiedene Multi-Level Badge-Typen`);
        console.log(`  → ${singleLevelBadges.length} Single-Level Badges`);
        
        // Verarbeite Single-Level Badges
        const processedBadges = [];
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
        
        // OPTIMIERT: Verarbeite Multi-Level Badges
        if (multiLevelBadgeMap.size > 0 && historicalFlights && historicalFlights.length > 0) {
            // Filtere historische Flüge
            const historyFlights = historicalFlights.filter(flight => {
                const flightDate = new Date(flight.date || flight.scoring_date || flight.takeoff_time);
                return flightDate >= HISTORY_START && flightDate <= HISTORY_END;
            });
            
            console.log(`  → ${historyFlights.length} Flüge im Historie-Zeitraum für Badge-Verifikation`);
            
            // Map für gefundene historische Badges
            const historicalBadgePoints = new Map(); // badge_id -> max_points_found
            
            // Durchsuche historische Flüge
            let flightsChecked = 0;
            let flightsWithDetails = 0;
            const maxFlightsToCheck = 100;
            
            for (const flight of historyFlights) {
                if (flightsChecked >= maxFlightsToCheck) {
                    console.log(`  ⏸️ Maximum von ${maxFlightsToCheck} Flügen erreicht`);
                    break;
                }
                
                flightsChecked++;
                const flightId = flight.rawData?.id || flight.id;
                
                if (!flightId) continue;
                
                try {
                    // Lade Flugdetails (mit Cache)
                    const flightDetails = await loadFlightDetailsWithCache(flightId);
                    if (!flightDetails) continue;
                    
                    flightsWithDetails++;
                    
                    // Extrahiere Achievements
                    let achievements = [];
                    if (flightDetails.achievement) {
                        achievements = Array.isArray(flightDetails.achievement) ? 
                            flightDetails.achievement : [flightDetails.achievement];
                    } else if (flightDetails.achievements) {
                        achievements = Array.isArray(flightDetails.achievements) ? 
                            flightDetails.achievements : [flightDetails.achievements];
                    }
                    
                    if (achievements.length === 0) continue;
                    
                    // OPTIMIERUNG: Prüfe ALLE Multi-Level Badges auf einmal
                    let foundBadgesInFlight = 0;
                    for (const achievement of achievements) {
                        const badgeId = achievement.badge_id || achievement.badge?.id;
                        
                        // Prüfe ob es ein gesuchtes Multi-Level Badge ist
                        if (badgeId && multiLevelBadgeMap.has(badgeId)) {
                            const points = achievement.points || 0;
                            const currentMax = historicalBadgePoints.get(badgeId) || 0;
                            
                            if (points > currentMax) {
                                historicalBadgePoints.set(badgeId, points);
                                foundBadgesInFlight++;
                                
                                console.log(`    ✅ ${badgeId}: ${points} Punkte (Flug ${flightId})`);
                            }
                        }
                    }
                    
                    if (foundBadgesInFlight > 0) {
                        console.log(`    → ${foundBadgesInFlight} relevante Badges in Flug ${flightId} gefunden`);
                    }
                    
                    // Progress
                    if (flightsChecked % 10 === 0) {
                        console.log(`    ... ${flightsChecked}/${historyFlights.length} Flüge geprüft`);
                    }
                    
                    // Rate limiting
                    if (flightsChecked % 5 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                } catch (error) {
                    // Fehler ignorieren und weitermachen
                    continue;
                }
            }
            
            console.log(`\n  📊 Badge-Verifikation abgeschlossen:`);
            console.log(`     ${flightsChecked} Flüge geprüft`);
            console.log(`     ${flightsWithDetails} mit Details geladen`);
            console.log(`     ${historicalBadgePoints.size} Badge-Typen in Historie gefunden`);
            
            // Berechne Season-Punkte für Multi-Level Badges
            for (const [badgeId, badges] of multiLevelBadgeMap) {
                // Nehme das Badge mit den höchsten Punkten
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
                    verificationMethod: historicalPoints > 0 ? 'batch-flight-search' : 'first-time',
                    flightsChecked,
                    flightsWithDetails
                });
                
                console.log(`  ${badgeId}: ${seasonPoints} Season-Punkte (${currentBadge.points} total - ${historicalPoints} historisch)`);
            }
        } else {
            // Keine Historie-Prüfung nötig/möglich
            for (const [badgeId, badges] of multiLevelBadgeMap) {
                const currentBadge = badges.reduce((max, badge) => 
                    badge.points > max.points ? badge : max
                );
                
                processedBadges.push({
                    ...currentBadge,
                    seasonPoints: currentBadge.points,
                    preSeasonPoints: 0,
                    foundPreSeason: false,
                    verified: true,
                    type: 'multi-level',
                    verificationMethod: 'no-history'
                });
            }
        }
        
        // Berechne finale Statistiken
        const totalSeasonPoints = processedBadges.reduce((sum, b) => sum + b.seasonPoints, 0);
        const flightsAnalyzed = historicalFlights?.length || 0;
        const flightsInSeason = currentSeasonFlights?.length || 0;
        const flightsWithBadges = seasonBadges.length > 0 ? 
            new Set(seasonBadges.map(b => b.flight_id).filter(id => id)).size : 0;
        
        console.log(`\n  ✅ ${userName}: ${totalSeasonPoints} Season-Punkte berechnet`);
        
        return {
            userId,
            userName,
            badges: processedBadges,
            seasonBadges: processedBadges,
            badgeCount: totalSeasonPoints,
            seasonBadgeCount: totalSeasonPoints,
            badgeCategoryCount: new Set(processedBadges.map(b => b.badge_id)).size,
            
            // Statistiken
            flightsAnalyzed,
            flightsInSeason,
            flightsWithBadges,
            
            // Weitere Felder für Kompatibilität
            totalBadges: achievements.length,
            seasonBadgesCount: seasonBadges.length,
            multiLevelCount: multiLevelBadgeMap.size,
            singleLevelCount: singleLevelBadges.length,
            multiLevelBadgeCount: multiLevelBadgeMap.size,
            verifiedBadgeCount: processedBadges.filter(b => b.verified).length,
            allTimeBadges: achievements,
            allTimeBadgeCount: achievements.length,
            priorSeasonCount: achievements.length - seasonBadges.length
        };
        
    } catch (error) {
        console.error(`  ❌ Fehler bei ${userName}:`, error.message);
        return createEmptyResult(userId, userName);
    }
}

/**
 * Lädt Flugdetails mit Cache
 */
async function loadFlightDetailsWithCache(flightId) {
    if (!flightId) return null;
    
    // Prüfe Cache
    if (flightDetailsCache.has(flightId)) {
        return flightDetailsCache.get(flightId);
    }
    
    try {
        const response = await fetch(`/api/proxy?path=flightdetail/${flightId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const details = await response.json();
        
        // In Cache speichern
        flightDetailsCache.set(flightId, details);
        
        return details;
    } catch (error) {
        return null;
    }
}

// Hilfsfunktionen
async function loadUserAchievements(userId) {
    try {
        const response = await fetch(`/api/proxy?path=achievement/user/${userId}`);
        
        if (!response.ok) {
            throw new Error(`Achievement-API Fehler: ${response.status}`);
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.warn(`  ⚠️ Konnte Achievements nicht laden:`, error.message);
        return [];
    }
}

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
        totalBadges: 0,
        seasonBadgesCount: 0,
        multiLevelCount: 0,
        singleLevelCount: 0,
        multiLevelBadgeCount: 0,
        verifiedBadgeCount: 0,
        allTimeBadges: [],
        allTimeBadgeCount: 0,
        priorSeasonCount: 0
    };
}

// Cache-Verwaltung
export function clearFlightDetailsCache() {
    flightDetailsCache.clear();
    console.log('✅ Flight Details Cache geleert');
}

export function getCacheStats() {
    return {
        size: flightDetailsCache.size,
        flightIds: Array.from(flightDetailsCache.keys())
    };
}

// Export für globale Verwendung
window.OptimizedBadgeEvaluator = {
    calculateUserSeasonBadgesOptimized,
    clearFlightDetailsCache,
    getCacheStats
};

console.log('✅ Optimized Badge Evaluator geladen!');
console.log('Verwende: OptimizedBadgeEvaluator.calculateUserSeasonBadgesOptimized()');