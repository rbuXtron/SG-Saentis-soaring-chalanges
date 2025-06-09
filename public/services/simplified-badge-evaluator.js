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
        const response = await fetch('/data/historical-badges-2024.json');
        historicalBadgeData = await response.json();
        console.log('✅ Historische Badge-Daten geladen:', historicalBadgeData.metadata);
        return historicalBadgeData;
    } catch (error) {
        console.error('❌ Fehler beim Laden der historischen Badge-Daten:', error);
        return { metadata: {}, badges: {} };
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
        const userHistoricalBadges = historical.badges[userId] || {};
        
        // Lade aktuelle Achievements
        const achievements = await dataLoadingManager.loadUserAchievements(userId);
        
        // Filtere Season Badges
        const seasonBadges = achievements.filter(badge => {
            const createdDate = new Date(badge.created);
            return createdDate >= SEASON_START && createdDate <= SEASON_END;
        });
        
        console.log(`  → ${seasonBadges.length} Badges in Saison 2024/2025`);
        console.log(`  → Historische Daten: ${Object.keys(userHistoricalBadges).length} Badges`);
        
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
        totalBadges: 0,
        allTimeBadges: [],
        seasonBadgePoints: 0,
        allTimeBadgePoints: 0,
        verifiedBadgeCount: 0
    };
}

// Export für Integration
export default calculateUserSeasonBadgesSimplified;