/**
 * Multi-Level Badge Evaluator
 * Erlaubt die gezielte Evaluierung von bestimmten Multi-Level Badges
 */

// Konfigurierbare Liste von Multi-Level Badge IDs
export const MULTI_LEVEL_BADGE_IDS = [
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
 * Erweiterte Version der verifyMultiLevelBadge Funktion
 * die nur bestimmte Badge-IDs evaluiert
 */
export async function verifyMultiLevelBadgeSelective(badge, historicalFlights, userId) {
    // Prüfe ob das Badge in unserer Liste ist
    const shouldEvaluate = MULTI_LEVEL_BADGE_IDS.some(id => 
        badge.badge_id.toLowerCase().includes(id.toLowerCase())
    );
    
    if (!shouldEvaluate) {
        console.log(`    ⏭️ Überspringe ${badge.badge_id} - nicht in Multi-Level Liste`);
        // Gebe alle Punkte als Season-Punkte zurück
        return {
            ...badge,
            seasonPoints: badge.points,
            preSeasonPoints: 0,
            foundPreSeason: false,
            verified: true,
            type: 'multi-level',
            verificationMethod: 'not-evaluated',
            skipped: true
        };
    }
    
    console.log(`    🔍 Evaluiere ${badge.badge_id} als Multi-Level Badge`);
    
    // Rest der originalen Logik aus badge-calculator-v2.js
    let preSeasonPoints = 0;
    let foundPreSeason = false;
    let foundInFlight = null;
    let flightsChecked = 0;
    let flightsWithDetails = 0;
    
    const HISTORY_START = new Date('2023-06-01T00:00:00');
    const HISTORY_END = new Date('2024-09-30T23:59:59');
    const maxFlightsToCheck = 150;
    
    for (const flight of historicalFlights) {
        const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
        
        if (flightDate < HISTORY_START || flightDate > HISTORY_END) {
            continue;
        }
        
        flightsChecked++;
        
        if (flightsChecked > maxFlightsToCheck && !foundPreSeason) {
            console.log(`      ⏸️ Suche nach ${flightsChecked} Flügen beendet`);
            break;
        }
        
        try {
            const flightDetails = await loadFlightDetails(flight.id);
            if (!flightDetails) continue;
            
            flightsWithDetails++;
            
            let achievements = null;
            if (flightDetails.achievement) {
                achievements = Array.isArray(flightDetails.achievement) ? 
                    flightDetails.achievement : [flightDetails.achievement];
            } else if (flightDetails.achievements && Array.isArray(flightDetails.achievements)) {
                achievements = flightDetails.achievements;
            }
            
            if (!achievements || achievements.length === 0) continue;
            
            const achievement = achievements.find(a => 
                a.badge_id === badge.badge_id || 
                a.badge === badge.badge_id ||
                (a.badge && typeof a.badge === 'object' && a.badge.id === badge.badge_id)
            );
            
            if (achievement) {
                preSeasonPoints = achievement.points || 0;
                foundPreSeason = true;
                foundInFlight = {
                    id: flight.id,
                    date: flightDate,
                    points: preSeasonPoints,
                    achievementId: achievement.id
                };
                
                console.log(`      ✅ Gefunden: ${preSeasonPoints} Punkte am ${flightDate.toLocaleDateString()}`);
                break;
            }
            
        } catch (error) {
            continue;
        }
        
        if (flightsChecked % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    const seasonPoints = Math.max(0, badge.points - preSeasonPoints);
    
    return {
        ...badge,
        seasonPoints,
        preSeasonPoints,
        foundPreSeason,
        foundInFlight,
        verified: true,
        type: 'multi-level',
        verificationMethod: foundPreSeason ? 'flight-search' : 'first-time',
        flightsChecked,
        flightsWithDetails
    };
}

/**
 * Helper-Funktion um zu prüfen ob ein Badge Multi-Level ist
 * basierend auf unserer konfigurierten Liste
 */
export function isConfiguredMultiLevelBadge(badgeId) {
    if (!badgeId) return false;
    
    return MULTI_LEVEL_BADGE_IDS.some(id => 
        badgeId.toLowerCase().includes(id.toLowerCase())
    );
}

/**
 * Erweiterte calculateUserSeasonBadges Funktion
 * die unsere konfigurierte Liste verwendet
 */
export async function calculateUserSeasonBadgesWithConfig(userId, userName, historicalFlights = null, currentSeasonFlights = null) {
    console.log(`\n👤 Verarbeite ${userName} (ID: ${userId}) mit konfigurierten Multi-Level Badges`);
    console.log(`   Historische Flüge übergeben: ${historicalFlights ? historicalFlights.length : 0}`);
    console.log(`   Season Flüge übergeben: ${currentSeasonFlights ? currentSeasonFlights.length : 0}`);
    
    try {
        const SEASON_START = new Date('2024-10-01T00:00:00');
        const SEASON_END = new Date('2025-09-30T23:59:59');
        const HISTORY_START = new Date('2023-06-01T00:00:00');
        const HISTORY_END = new Date('2024-09-30T23:59:59');
        
        // Filtere historische Flüge für Badge-Historie
        let flightsForBadgeHistory = [];
        if (historicalFlights && Array.isArray(historicalFlights) && historicalFlights.length > 0) {
            flightsForBadgeHistory = historicalFlights.filter(flight => {
                const flightDate = new Date(flight.date || flight.scoring_date || flight.takeoff_time);
                return flightDate >= HISTORY_START && flightDate <= HISTORY_END;
            });
            console.log(`   Flüge im Historie-Zeitraum (01.06.2023-30.09.2024): ${flightsForBadgeHistory.length}`);
        }
        
        // Lade Achievements direkt über die API
        const achievements = await loadUserAchievements(userId);
        
        // Filtere Season Badges
        const seasonBadges = achievements.filter(badge => {
            const createdDate = new Date(badge.created);
            return createdDate >= SEASON_START && createdDate <= SEASON_END;
        });
        
        console.log(`  → ${seasonBadges.length} Badges in Saison 2024/2025`);
        
        // Kategorisiere Badges basierend auf unserer Liste
        const configuredMultiLevel = [];
        const otherBadges = [];
        
        seasonBadges.forEach(badge => {
            if (isConfiguredMultiLevelBadge(badge.badge_id)) {
                configuredMultiLevel.push(badge);
            } else {
                otherBadges.push(badge);
            }
        });
        
        console.log(`  → ${configuredMultiLevel.length} konfigurierte Multi-Level Badges`);
        console.log(`  → ${otherBadges.length} andere Badges`);
        
        // Verarbeite Badges
        const processedBadges = [];
        
        // Andere Badges bekommen einfach 1 Punkt
        otherBadges.forEach(badge => {
            processedBadges.push({
                ...badge,
                seasonPoints: 1,
                verified: true,
                type: 'single-level',
                foundPreSeason: false,
                preSeasonPoints: 0
            });
        });
        
        // Multi-Level Badges verifizieren
        for (const badge of configuredMultiLevel) {
            // Übergebe die gefilterten historischen Flüge
            const result = await verifyMultiLevelBadgeSelective(badge, flightsForBadgeHistory, userId);
            processedBadges.push(result);
        }
        
        // Berechne finale Punkte
        const totalSeasonPoints = processedBadges.reduce((sum, b) => sum + b.seasonPoints, 0);
        
        // WICHTIG: Nutze den übergebenen Parameter, nicht die lokale Variable!
        const flightsAnalyzed = (historicalFlights && historicalFlights.length) || 0;
        const flightsInSeason = (currentSeasonFlights && currentSeasonFlights.length) || 0;
        const flightsWithBadges = seasonBadges.length > 0 ? 
            new Set(seasonBadges.map(b => b.flight_id).filter(id => id)).size : 0;
        
        console.log(`  ✅ ${userName}: ${totalSeasonPoints} Season-Punkte`);
        console.log(`     Flüge analysiert: ${flightsAnalyzed}, Saison-Flüge: ${flightsInSeason}`);
        console.log(`     Flüge mit Badges: ${flightsWithBadges}`);
        console.log(`     Historie-Flüge für Badge-Verifikation: ${flightsForBadgeHistory.length}`);
        
        console.log(`  ✅ ${userName}: ${totalSeasonPoints} Season-Punkte`);
        console.log(`     Flüge analysiert: ${flightsAnalyzed}, Saison-Flüge: ${flightsInSeason}`);
        console.log(`     Flüge mit Badges: ${flightsWithBadges}`);
        
        return {
            userId,
            userName,
            badges: processedBadges,
            seasonBadges: processedBadges,
            badgeCount: totalSeasonPoints,
            seasonBadgeCount: totalSeasonPoints,
            badgeCategoryCount: new Set(processedBadges.map(b => b.badge_id)).size,
            configuredMultiLevelCount: configuredMultiLevel.length,
            processedBadges,
            
            // Wichtige Statistiken für die Anzeige
            flightsAnalyzed: flightsAnalyzed,
            flightsInSeason: flightsInSeason,
            flightsWithBadges: flightsWithBadges,
            
            // Zusätzliche Felder für Kompatibilität
            totalBadges: achievements.length,
            seasonBadgesCount: seasonBadges.length,
            multiLevelCount: configuredMultiLevel.length,
            singleLevelCount: otherBadges.length,
            multiLevelBadgeCount: configuredMultiLevel.length,
            verifiedBadgeCount: processedBadges.filter(b => b.verified).length,
            allTimeBadges: achievements,
            allTimeBadgeCount: achievements.length,
            priorSeasonCount: achievements.length - seasonBadges.length
        };
        
    } catch (error) {
        console.error(`  ❌ Fehler bei ${userName}:`, error.message);
        return {
            userId,
            userName,
            badges: [],
            badgeCount: 0,
            error: error.message
        };
    }
}

// Hilfsfunktion zum Laden von Flugdetails (aus badge-calculator-v2.js)
async function loadFlightDetails(flightId) {
    if (!flightId) return null;
    
    try {
        const response = await fetch(`/api/proxy?path=flightdetail/${flightId}`);
        if (!response.ok) {
            throw new Error(`Flugdetails nicht verfügbar: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        return null;
    }
}

// Hilfsfunktion zum Laden von User Achievements
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

// Debug-Funktion zum Anzeigen aller konfigurierten Multi-Level Badges
export function debugMultiLevelBadgeList() {
    console.log('\n🏅 Konfigurierte Multi-Level Badges:');
    console.log('=====================================');
    MULTI_LEVEL_BADGE_IDS.forEach((id, index) => {
        console.log(`${index + 1}. ${id}`);
    });
    console.log(`\nGesamt: ${MULTI_LEVEL_BADGE_IDS.length} Multi-Level Badge-Typen`);
}

// Debug-Funktion für Badge-Analyse
export function debugBadgeAnalysis(pilot) {
    console.log('\n🔍 DEBUG Badge-Analyse für', pilot.name);
    console.log('=====================================');
    console.log('Flüge analysiert:', pilot.flightsAnalyzed || 0);
    console.log('Flüge in Saison:', pilot.flightsInSeason || 0);
    console.log('Flüge mit Badges:', pilot.flightsWithBadges || 0);
    console.log('Season Badges:', pilot.seasonBadgeCount || 0);
    console.log('Badge Kategorien:', pilot.badgeCategoryCount || 0);
    console.log('Multi-Level Badges:', pilot.multiLevelBadgeCount || 0);
    
    if (pilot.badges && pilot.badges.length > 0) {
        console.log('\nBadges:');
        pilot.badges.forEach(badge => {
            console.log(`  - ${badge.badge_id}: ${badge.seasonPoints} Punkte`);
        });
    } else {
        console.log('\nKeine Badges gefunden');
    }
}

// Export für globale Verwendung
window.MultiLevelBadgeEvaluator = {
    MULTI_LEVEL_BADGE_IDS,
    verifyMultiLevelBadgeSelective,
    isConfiguredMultiLevelBadge,
    calculateUserSeasonBadgesWithConfig,
    debugMultiLevelBadgeList,
    debugBadgeAnalysis
};