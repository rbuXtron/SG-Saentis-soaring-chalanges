// /public/js/services/badge-season-calculator-final.js
/**
 * SG Säntis Cup - Finaler Badge Season Calculator
 * 
 * Berechnet Badges der Saison 2024/2025 korrekt:
 * - Nur Badges mit created >= 1.10.2024 zählen
 * - Multi-Level Badges werden durch Rückwärtssuche verifiziert
 * - Punkte = Anzahl der Badge-Icons bei Multi-Level Badges
 */

import { apiClient } from './weglide-api-service.js';

const SEASON_START = new Date('2024-10-01T00:00:00');
const DEBUG_MODE = true;

/**
 * Hauptfunktion: Berechnet Season Badges
 */
export async function calculateSeasonBadgesFinal(userId, pilotName) {
  console.log(`\n🏅 Berechne Saison 24/25 Badges für ${pilotName} (ID: ${userId})`);
  
  try {
    // 1. Lade ALLE Badges des Users
    const allUserBadges = await apiClient.fetchUserAchievements(userId);
    
    if (!allUserBadges || allUserBadges.length === 0) {
      console.log(`   → Keine Badges gefunden`);
      return createEmptyResult(pilotName, userId);
    }
    
    console.log(`   → ${allUserBadges.length} Badges insgesamt gefunden`);
    
    // 2. Filtere nur Badges aus der aktuellen Saison (created >= 1.10.2024)
    const seasonBadges = allUserBadges.filter(badge => {
      const createdDate = new Date(badge.created);
      return createdDate >= SEASON_START;
    });
    
    console.log(`   → ${seasonBadges.length} Badges in Saison 24/25`);
    
    if (seasonBadges.length === 0) {
      return createEmptyResult(pilotName, userId);
    }
    
    // 3. Separiere Single-Level und Multi-Level Badges
    const singleLevelBadges = [];
    const multiLevelBadges = [];
    
    seasonBadges.forEach(badge => {
      const points = badge.points || 1;
      
      if (points > 1) {
        // Multi-Level Badge (points > 1)
        multiLevelBadges.push({
          ...badge,
          isMultiLevel: true,
          originalPoints: points
        });
        console.log(`   📊 Multi-Level: ${badge.badge?.name || badge.badge_id} = ${points} Punkte`);
      } else {
        // Single-Level Badge (points = 1)
        singleLevelBadges.push({
          ...badge,
          isMultiLevel: false,
          finalPoints: 1
        });
      }
    });
    
    console.log(`   → ${multiLevelBadges.length} Multi-Level Badges zum Prüfen`);
    console.log(`   → ${singleLevelBadges.length} Single-Level Badges (zählen voll)`);
    
    // 4. Verarbeite Multi-Level Badges durch Rückwärtssuche
    const processedMultiLevelBadges = [];
    let historicalFlights = []; // HIER: Variable außerhalb des if-Blocks definieren
    
    if (multiLevelBadges.length > 0) {
      console.log(`\n   🔄 Starte Rückwärtssuche für Multi-Level Badges...`);
      
      // Lade User-Flüge für Rückwärtssuche
      historicalFlights = await loadHistoricalFlights(userId);
      console.log(`   → ${historicalFlights.length} historische Flüge gefunden`);
      
      // Map zum Tracken welche Badges bereits gefunden wurden
      const foundBadgesMap = new Map();
      
      // Durchsuche Flüge rückwärts
      for (const flight of historicalFlights) {
        // Prüfe ob alle Multi-Level Badges bereits gefunden wurden
        if (foundBadgesMap.size === multiLevelBadges.length) {
          console.log(`   ✅ Alle ${multiLevelBadges.length} Multi-Level Badges verifiziert - Suche beendet`);
          break;
        }
        
        // Lade Flugdetails
        try {
          const flightDetails = await apiClient.fetchFlightDetails(flight.id);
          if (!flightDetails || !flightDetails.achievements) continue;
          
          // Prüfe Achievements im Flug
          for (const achievement of flightDetails.achievements) {
            // Suche nach diesem Badge-Typ in unseren Multi-Level Badges
            const matchingBadge = multiLevelBadges.find(
              mb => mb.badge_id === achievement.badge_id && !foundBadgesMap.has(mb.badge_id)
            );
            
            if (matchingBadge) {
              // Badge in Vergangenheit gefunden!
              const oldPoints = achievement.points || 1;
              const newPoints = matchingBadge.originalPoints;
              const seasonPoints = Math.max(0, newPoints - oldPoints);
              
              console.log(`   🔍 ${matchingBadge.badge?.name || matchingBadge.badge_id}:`);
              console.log(`      Alter Stand: ${oldPoints} Punkte (${flight.scoring_date})`);
              console.log(`      Neuer Stand: ${newPoints} Punkte`);
              console.log(`      → Saison-Punkte: ${seasonPoints}`);
              
              foundBadgesMap.set(matchingBadge.badge_id, {
                oldPoints,
                flightId: flight.id,
                flightDate: flight.scoring_date
              });
              
              // Badge mit berechneten Punkten speichern
              processedMultiLevelBadges.push({
                ...matchingBadge,
                finalPoints: seasonPoints,
                preSeasonPoints: oldPoints,
                foundInFlight: flight.id
              });
            }
          }
        } catch (error) {
          console.warn(`   ⚠️ Fehler beim Laden von Flug ${flight.id}:`, error.message);
          continue;
        }
      }
      
      // Verarbeite Multi-Level Badges die NICHT in der Vergangenheit gefunden wurden
      multiLevelBadges.forEach(badge => {
        if (!foundBadgesMap.has(badge.badge_id)) {
          console.log(`   ✨ ${badge.badge?.name || badge.badge_id}: Neu in dieser Saison = ${badge.originalPoints} Punkte`);
          processedMultiLevelBadges.push({
            ...badge,
            finalPoints: badge.originalPoints,
            preSeasonPoints: 0,
            isNew: true
          });
        }
      });
    }
    
    // 5. Erstelle finale Badge-Liste für die Saison
    const finalSeasonBadges = [];
    
    // Single-Level Badges (1 Punkt pro Badge)
    singleLevelBadges.forEach(badge => {
      finalSeasonBadges.push({
        ...badge,
        points: 1,
        type: 'single-level',
        // Für UI-Kompatibilität
        name: badge.badge?.name || badge.name || badge.badge_id,
        description: badge.badge?.description || badge.description || '',
        logo: badge.badge?.logo || badge.logo || null,
        achieved_at: badge.created,
        verified: true,
        season: '2024/2025'
      });
    });
    
    // Multi-Level Badges (finalPoints = berechnete Punkte)
    processedMultiLevelBadges.forEach(badge => {
      // Erstelle einen Eintrag pro Punkt
      for (let i = 0; i < badge.finalPoints; i++) {
        finalSeasonBadges.push({
          ...badge,
          points: 1,
          pointIndex: i + 1,
          totalPoints: badge.finalPoints,
          type: 'multi-level',
          // Für UI-Kompatibilität
          name: badge.badge?.name || badge.name || badge.badge_id,
          description: badge.badge?.description || badge.description || '',
          logo: badge.badge?.logo || badge.logo || null,
          achieved_at: badge.created,
          verified: true,
          season: '2024/2025'
        });
      }
    });
    
    // 6. Berechne Statistiken
    const stats = {
      totalSeasonBadges: finalSeasonBadges.length,
      singleLevelCount: singleLevelBadges.length,
      multiLevelCount: multiLevelBadges.length,
      multiLevelVerified: processedMultiLevelBadges.filter(b => !b.isNew).length,
      multiLevelNew: processedMultiLevelBadges.filter(b => b.isNew).length,
      totalPoints: finalSeasonBadges.length,
      badgesByMonth: {},
      topBadges: []
    };
    
    // Gruppiere nach Monat
    finalSeasonBadges.forEach(badge => {
      if (badge.created) {
        const month = new Date(badge.created).toLocaleDateString('de-DE', { 
          year: 'numeric', 
          month: 'long' 
        });
        stats.badgesByMonth[month] = (stats.badgesByMonth[month] || 0) + 1;
      }
    });
    
    // Top Badges
    const badgeCounts = {};
    finalSeasonBadges.forEach(badge => {
      const name = badge.name || badge.badge_id;
      badgeCounts[name] = (badgeCounts[name] || 0) + 1;
    });
    
    stats.topBadges = Object.entries(badgeCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    
    console.log(`\n📊 Zusammenfassung für ${pilotName}:`);
    console.log(`   → ${stats.totalSeasonBadges} Badge-Punkte in Saison 24/25`);
    console.log(`   → ${stats.singleLevelCount} Single-Level Badges`);
    console.log(`   → ${stats.multiLevelCount} Multi-Level Badges`);
    console.log(`     - ${stats.multiLevelVerified} verifiziert (Punkte reduziert)`);
    console.log(`     - ${stats.multiLevelNew} neu in dieser Saison`);
    
    return {
      pilotName,
      userId,
      seasonBadges: finalSeasonBadges,
      allTimeBadges: allUserBadges,
      stats,
      // Kompatibilität mit bestehendem Code
      badges: finalSeasonBadges,
      badgeCount: finalSeasonBadges.length,
      badgeCategoryCount: new Set(finalSeasonBadges.map(b => b.badge_id)).size,
      flightsAnalyzed: historicalFlights.length,
      flightsWithBadges: new Set(finalSeasonBadges.filter(b => b.flight_id).map(b => b.flight_id)).size,
      // Neue Felder für UI
      seasonBadgeCount: finalSeasonBadges.length,
      seasonBadgeTypeCount: new Set(finalSeasonBadges.map(b => b.badge_id)).size,
      allTimeBadgeCount: allUserBadges.length,
      verifiedBadgeCount: processedMultiLevelBadges.filter(b => !b.isNew).length,
      firstTimeTypes: processedMultiLevelBadges.filter(b => b.isNew).length,
      repeatedTypes: processedMultiLevelBadges.filter(b => !b.isNew).length,
      multipleOccurrences: []
    };
    
  } catch (error) {
    console.error(`❌ Fehler bei Badge-Berechnung:`, error);
    return createEmptyResult(pilotName, userId);
  }
}

/**
 * Lädt historische Flüge (vor Saisonbeginn)
 */
async function loadHistoricalFlights(userId) {
  const allFlights = [];
  const currentYear = new Date().getFullYear();
  
  // Lade Flüge der letzten Jahre
  for (const year of [2024, 2023, 2022]) {
    try {
      const flights = await apiClient.fetchUserFlights(userId, year);
      if (Array.isArray(flights)) {
        allFlights.push(...flights);
      }
    } catch (error) {
      console.warn(`   ⚠️ Fehler beim Laden der Flüge für ${year}:`, error.message);
    }
  }
  
  // Filtere nur Flüge VOR Saisonbeginn und sortiere rückwärts
  const historicalFlights = allFlights
    .filter(flight => new Date(flight.scoring_date || flight.takeoff_time) < SEASON_START)
    .sort((a, b) => {
      const dateA = new Date(a.scoring_date || a.takeoff_time);
      const dateB = new Date(b.scoring_date || b.takeoff_time);
      return dateB - dateA; // Neueste zuerst
    });
  
  return historicalFlights;
}

/**
 * Erstellt ein leeres Ergebnis
 */
function createEmptyResult(pilotName, userId) {
  return {
    pilotName,
    userId,
    seasonBadges: [],
    allTimeBadges: [],
    badges: [],
    badgeCount: 0,
    badgeCategoryCount: 0,
    seasonBadgeCount: 0,
    seasonBadgeTypeCount: 0,
    allTimeBadgeCount: 0,
    verifiedBadgeCount: 0,
    stats: {
      totalSeasonBadges: 0,
      singleLevelCount: 0,
      multiLevelCount: 0,
      multiLevelVerified: 0,
      multiLevelNew: 0,
      totalPoints: 0,
      badgesByMonth: {},
      topBadges: []
    },
    flightsAnalyzed: 0,
    flightsWithBadges: 0,
    firstTimeTypes: 0,
    repeatedTypes: 0,
    multipleOccurrences: []
  };
}

/**
 * Test-Funktion
 */
export async function testBadgeCalculationFinal(userId, pilotName) {
  console.log('\n🧪 TESTE FINALE BADGE-BERECHNUNG');
  console.log('═══════════════════════════════════════════════════════');
  
  const result = await calculateSeasonBadgesFinal(userId, pilotName);
  
  console.log('\n📊 TESTERGEBNIS:');
  console.log(`Pilot: ${result.pilotName} (ID: ${result.userId})`);
  console.log(`Badge-Punkte gesamt: ${result.badgeCount}`);
  console.log(`Verschiedene Badge-Typen: ${result.badgeCategoryCount}`);
  
  if (result.stats) {
    console.log('\nDetails:');
    console.log(`- Single-Level: ${result.stats.singleLevelCount}`);
    console.log(`- Multi-Level: ${result.stats.multiLevelCount}`);
    console.log(`  → Verifiziert: ${result.stats.multiLevelVerified}`);
    console.log(`  → Neu: ${result.stats.multiLevelNew}`);
  }
  
  return result;
}