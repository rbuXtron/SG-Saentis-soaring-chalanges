// /public/js/services/badge-reverse-calculator-enhanced.js
/**
 * SG Säntis Cup - Enhanced Badge Reverse Calculator
 * 
 * Berechnet Badges der Saison 2024/2025 durch präzise Rückwärtssuche
 * Version 4.0 - Mit korrektem flightdetail Endpunkt
 */

import { apiClient } from './weglide-api-service.js';

const SEASON_END = new Date('2024-09-30T23:59:59');    // 30. September 2024, 23:59
const SEASON_START = new Date('2024-10-01T00:00:00');  // 1. Oktober 2024, 00:00
const DEBUG_MODE = true;

/**
 * Cache für Flugdetails
 */
const flightDetailsCache = new Map();

/**
 * Lädt Flugdetails mit Cache
 */
async function loadFlightDetails(flightId) {
  if (!flightId) return null;
  
  if (flightDetailsCache.has(flightId)) {
    return flightDetailsCache.get(flightId);
  }

  try {
    const details = await apiClient.fetchFlightDetails(flightId);
    flightDetailsCache.set(flightId, details);
    return details;
  } catch (error) {
    console.warn(`Fehler beim Laden von Flug ${flightId}:`, error.message);
    return null;
  }
}

/**
 * Lädt mehrere Flugdetails in Batches
 */
async function loadFlightDetailsBatch(flightIds) {
  const batchSize = 5; // Lade 5 Flüge parallel
  const results = new Map();
  
  for (let i = 0; i < flightIds.length; i += batchSize) {
    const batch = flightIds.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (flightId) => {
      try {
        const details = await loadFlightDetails(flightId);
        return { flightId, details };
      } catch (error) {
        console.warn(`Fehler bei Flug ${flightId}:`, error.message);
        return { flightId, details: null };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(({ flightId, details }) => {
      if (details) results.set(flightId, details);
    });
    
    // Kleine Pause zwischen Batches für Rate Limiting
    if (i + batchSize < flightIds.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

/**
 * Hauptfunktion: Berechnet Season-Badges durch präzise Rückwärtssuche
 */
export async function calculateSeasonBadgesReverse(userId, pilotName) {
  console.log(`\n🔄 Starte präzise Rückwärts-Badge-Berechnung für ${pilotName} (ID: ${userId})`);
  console.log(`   Saisongrenze: ${SEASON_END.toLocaleString('de-DE')}`);
  
  try {
    // 1. Lade aktuelle Badges des Piloten
    const currentBadges = await apiClient.fetchUserAchievements(userId);
    
    if (!currentBadges || currentBadges.length === 0) {
      console.log(`   → Keine Badges gefunden`);
      return createEmptyResult(pilotName, userId);
    }
    
    console.log(`   → ${currentBadges.length} aktuelle Badge-Einträge gefunden`);
    
    // 2. Lade alle Flüge des Piloten (mehrere Jahre für vollständige Historie)
    const allFlights = await loadAllUserFlights(userId);
    console.log(`   → ${allFlights.length} Flüge insgesamt gefunden`);
    
    // 3. Sortiere Flüge chronologisch (neueste zuerst für Rückwärtssuche)
    allFlights.sort((a, b) => {
      const dateA = new Date(a.scoring_date || a.takeoff_time);
      const dateB = new Date(b.scoring_date || b.takeoff_time);
      return dateB - dateA; // Neueste zuerst
    });
    
    // 4. Verarbeite jeden Badge-Typ
    const badgeResults = new Map(); // badge_id -> Ergebnis
    const processedBadges = [];
    
    // Gruppiere aktuelle Badges nach Typ
    const badgesByType = new Map();
    currentBadges.forEach(badge => {
      if (!badge.badge_id) return;
      
      if (!badgesByType.has(badge.badge_id)) {
        badgesByType.set(badge.badge_id, badge);
      }
    });
    
    console.log(`   → ${badgesByType.size} verschiedene Badge-Typen zu verarbeiten`);
    
    // 5. Verarbeite jeden Badge-Typ einzeln mit präziser Rückwärtssuche
    for (const [badgeId, currentBadge] of badgesByType) {
      console.log(`\n   📍 Verarbeite Badge: ${currentBadge.badge?.name || badgeId}`);
      
      const result = await processBadgeWithPreciseReverseSearch(
        currentBadge,
        allFlights,
        SEASON_END,
        userId
      );
      
      badgeResults.set(badgeId, result);
      
      // Erstelle Badge-Einträge für die Saison
      if (result.seasonPoints > 0) {
        // Bei Multi-Level Badges: Erstelle einen Eintrag pro Punkt
        for (let i = 0; i < result.seasonPoints; i++) {
          const badgeEntry = {
            ...currentBadge,
            id: `${currentBadge.id}_season_${i + 1}`,
            badge_id: badgeId,
            name: currentBadge.badge?.name || badgeId,
            description: currentBadge.badge?.description || '',
            logo: currentBadge.badge?.logo || null,
            points: 1, // Jeder Eintrag zählt als 1 Punkt
            level: result.currentLevel,
            value: result.currentValue,
            season_points: result.seasonPoints,
            pre_season_points: result.preSeasonPoints,
            pre_season_level: result.preSeasonLevel,
            is_multi_level: result.isMultiLevel,
            achieved_at: result.firstSeasonAchievement?.date,
            flight_id: result.firstSeasonAchievement?.flightId,
            season: '2024/2025',
            verified: true,
            point_index: i + 1,
            total_season_points: result.seasonPoints,
            improvement_details: result.improvementDetails,
            // Zusätzliche Debug-Infos
            _debug: {
              foundInFlightId: result.lastPreSeasonFlightId,
              foundInFlightDate: result.lastPreSeasonFlightDate,
              searchedFlights: result.searchedFlights,
              levelDetails: result.levelDetails
            }
          };
          
          processedBadges.push(badgeEntry);
        }
        
        console.log(`     ✅ ${result.seasonPoints} neue Punkte in Saison 24/25`);
      } else {
        console.log(`     ❌ Keine neuen Punkte in Saison 24/25`);
      }
    }
    
    // 6. Berechne Statistiken
    const stats = calculateBadgeStats(processedBadges, badgeResults);
    
    console.log(`\n📊 Zusammenfassung für ${pilotName}:`);
    console.log(`   → ${processedBadges.length} Badge-Punkte in Saison 24/25`);
    console.log(`   → ${stats.uniqueTypes} verschiedene Badge-Typen`);
    console.log(`   → ${stats.newTypes} erstmalig erreichte Typen`);
    console.log(`   → ${stats.improvedTypes} verbesserte Multi-Level Badges`);
    console.log(`   → ${stats.totalFlightsWithAchievements} Flüge mit Achievements gefunden`);
    
    return {
      pilotName,
      userId,
      seasonBadges: processedBadges,
      allTimeBadges: currentBadges,
      badgeResults: Array.from(badgeResults.values()),
      stats,
      seasonBadgeCount: processedBadges.length,
      seasonBadgeTypeCount: stats.uniqueTypes,
      flightsAnalyzed: allFlights.length,
      flightsBeforeSeason: allFlights.filter(f => 
        new Date(f.scoring_date || f.takeoff_time) <= SEASON_END
      ).length,
      flightsWithBadges: stats.totalFlightsWithAchievements || 0,
      flightsAnalyzed: allFlights.length
    };
    
  } catch (error) {
    console.error(`❌ Fehler bei Badge-Berechnung:`, error);
    return createEmptyResult(pilotName, userId);
  }
}

/**
 * Verarbeitet einen Badge-Typ mit präziser Rückwärtssuche
 */
async function processBadgeWithPreciseReverseSearch(currentBadge, allFlights, seasonEnd, userId) {
  const badgeId = currentBadge.badge_id;
  const badgeInfo = currentBadge.badge || {};
  const isMultiLevel = !!(badgeInfo.values || badgeInfo.points);
  
  // Aktueller Stand
  const currentValue = currentBadge.value || 0;
  let currentLevel = 0;
  let totalCurrentPoints = 0;
  
  // Bei Multi-Level: Berechne aktuelles Level und Gesamtpunkte
  if (isMultiLevel && badgeInfo.values) {
    for (let i = badgeInfo.values.length - 1; i >= 0; i--) {
      if (currentValue >= badgeInfo.values[i]) {
        currentLevel = i + 1;
        break;
      }
    }
    
    // Berechne Gesamtpunkte für aktuelles Level
    if (badgeInfo.points && currentLevel > 0) {
      for (let i = 0; i < currentLevel; i++) {
        totalCurrentPoints += badgeInfo.points[i] || 1;
      }
    } else {
      totalCurrentPoints = currentLevel;
    }
  } else {
    // Single-Level Badge
    totalCurrentPoints = currentBadge.points || 1;
  }
  
  console.log(`     Aktuell: Level ${currentLevel}, Wert ${currentValue}, ${totalCurrentPoints} Punkte gesamt`);
  
  // Rückwärtssuche in Flügen
  let foundPreSeasonAchievement = false;
  let preSeasonValue = 0;
  let preSeasonLevel = 0;
  let preSeasonPoints = 0;
  let firstSeasonAchievement = null;
  let lastPreSeasonFlightId = null;
  let lastPreSeasonFlightDate = null;
  let searchedFlights = 0;
  let flightsWithThisBadge = 0;
  
  // Durchsuche Flüge rückwärts (neueste zuerst)
  for (const flight of allFlights) {
    const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
    searchedFlights++;
    
    // Lade Flugdetails
    const flightDetails = await loadFlightDetails(flight.id);
    if (!flightDetails) continue;
    
    // Prüfe ob Achievements vorhanden sind
    if (!flightDetails.achievements || !Array.isArray(flightDetails.achievements)) {
      continue;
    }
    
    // Suche nach diesem Badge in den Achievements
    const achievement = flightDetails.achievements.find(a => a.badge_id === badgeId);
    
    if (achievement) {
      flightsWithThisBadge++;
      
      // Sammle erste Season-Achievement
      if (flightDate > seasonEnd && flightDate >= SEASON_START && !firstSeasonAchievement) {
        firstSeasonAchievement = {
          flightId: flight.id,
          date: flightDate,
          value: achievement.value
        };
        console.log(`     📌 Erstes Season-Achievement: ${flightDate.toLocaleDateString('de-DE')} (Wert: ${achievement.value})`);
      }
      
      // Prüfe nur Flüge vor Saisonende
      if (flightDate <= seasonEnd) {
        console.log(`     🔍 Gefunden in Flug vom ${flightDate.toLocaleDateString('de-DE')}: Wert ${achievement.value}`);
        
        // Badge vor Saisonende gefunden!
        foundPreSeasonAchievement = true;
        lastPreSeasonFlightId = flight.id;
        lastPreSeasonFlightDate = flightDate;
        
        if (isMultiLevel) {
          preSeasonValue = achievement.value || 0;
          
          // Berechne Pre-Season Level
          if (badgeInfo.values) {
            for (let i = badgeInfo.values.length - 1; i >= 0; i--) {
              if (preSeasonValue >= badgeInfo.values[i]) {
                preSeasonLevel = i + 1;
                break;
              }
            }
          }
          
          // Berechne Pre-Season Punkte
          if (badgeInfo.points && preSeasonLevel > 0) {
            for (let i = 0; i < preSeasonLevel; i++) {
              preSeasonPoints += badgeInfo.points[i] || 1;
            }
          } else {
            preSeasonPoints = preSeasonLevel;
          }
          
          console.log(`     📌 Pre-Season Stand: Level ${preSeasonLevel}, ${preSeasonPoints} Punkte`);
        } else {
          // Single-Level Badge
          preSeasonPoints = 1;
          console.log(`     📌 Single-Level Badge bereits vor Saison erreicht`);
        }
        
        // WICHTIG: Stoppe Suche nach erstem Fund vor Saisonende
        break;
      }
    }
  }
  
  if (!foundPreSeasonAchievement && flightsWithThisBadge === 0) {
    console.log(`     ℹ️ Badge niemals in Flügen gefunden (nur in Achievement-Liste)`);
  }
  
  // Berechne Season-Punkte
  let seasonPoints = 0;
  let improvementDetails = '';
  const levelDetails = [];
  
  if (isMultiLevel) {
    // Multi-Level: Ziehe Pre-Season Punkte ab
    seasonPoints = Math.max(0, totalCurrentPoints - preSeasonPoints);
    
    if (seasonPoints > 0) {
      improvementDetails = `Level ${preSeasonLevel} → ${currentLevel} (+${seasonPoints} Punkte)`;
      
      // Details für jeden neuen Level
      if (badgeInfo.points && badgeInfo.values) {
        for (let i = preSeasonLevel; i < currentLevel; i++) {
          levelDetails.push({
            level: i + 1,
            value: badgeInfo.values[i],
            points: badgeInfo.points[i] || 1
          });
        }
      }
    } else if (foundPreSeasonAchievement) {
      improvementDetails = `Keine Verbesserung (bereits Level ${currentLevel})`;
    } else {
      improvementDetails = `Erstmalig Level ${currentLevel} erreicht`;
    }
  } else {
    // Single-Level: 1 Punkt wenn neu in der Saison
    seasonPoints = foundPreSeasonAchievement ? 0 : 1;
    
    if (seasonPoints > 0) {
      improvementDetails = 'Erstmalig in Saison 24/25 erreicht';
    } else {
      improvementDetails = 'Bereits vor Saison 24/25 erreicht';
    }
  }
  
  console.log(`     📊 Ergebnis: ${seasonPoints} Punkte für Saison 24/25`);
  
  return {
    badgeId,
    badgeName: badgeInfo.name || badgeId,
    isMultiLevel,
    currentLevel,
    currentValue,
    preSeasonLevel,
    preSeasonValue,
    preSeasonPoints,
    seasonPoints,
    totalCurrentPoints,
    foundPreSeason: foundPreSeasonAchievement,
    firstSeasonAchievement,
    lastPreSeasonFlightId,
    lastPreSeasonFlightDate,
    searchedFlights,
    flightsWithThisBadge,
    improvementDetails,
    levelDetails
  };
}

/**
 * Lädt alle Flüge eines Users
 */
async function loadAllUserFlights(userId) {
  const allFlights = [];
  const currentYear = new Date().getFullYear();
  
  // Lade Flüge für mehrere Jahre (für vollständige Historie)
  const yearsToLoad = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
  
  console.log(`   Lade Flüge für Jahre: ${yearsToLoad.join(', ')}`);
  
  for (const year of yearsToLoad) {
    try {
      const flights = await apiClient.fetchUserFlights(userId, year);
      if (Array.isArray(flights)) {
        allFlights.push(...flights);
        console.log(`     → ${year}: ${flights.length} Flüge`);
      }
    } catch (error) {
      console.warn(`     ⚠️ Fehler beim Laden der Flüge für ${year}:`, error.message);
    }
  }
  
  // Entferne Duplikate
  const uniqueFlights = Array.from(
    new Map(allFlights.map(f => [f.id, f])).values()
  );
  
  console.log(`   → ${uniqueFlights.length} eindeutige Flüge nach Duplikat-Entfernung`);
  
  return uniqueFlights;
}

/**
 * Berechnet Badge-Statistiken
 */
function calculateBadgeStats(seasonBadges, badgeResults) {
  const stats = {
    uniqueTypes: new Set(seasonBadges.map(b => b.badge_id)).size,
    totalPoints: seasonBadges.length,
    newTypes: 0,
    improvedTypes: 0,
    unchangedTypes: 0,
    badgesByMonth: {},
    topBadges: [],
    detailsByType: {},
    totalFlightsWithAchievements: 0,
    firstTimeTypes: 0,
    repeatedTypes: 0,
    multipleOccurrences: []
  };
  
  // Analysiere Badge-Results
  badgeResults.forEach(result => {
    stats.totalFlightsWithAchievements += result.flightsWithThisBadge || 0;
    
    if (result.seasonPoints > 0) {
      if (!result.foundPreSeason) {
        stats.newTypes++;
        stats.firstTimeTypes++;
      } else if (result.isMultiLevel) {
        stats.improvedTypes++;
        stats.repeatedTypes++;
      }
    } else if (result.foundPreSeason) {
      stats.unchangedTypes++;
    }
    
    // Speichere Details pro Typ
    stats.detailsByType[result.badgeId] = {
      name: result.badgeName,
      seasonPoints: result.seasonPoints,
      preSeasonLevel: result.preSeasonLevel,
      currentLevel: result.currentLevel,
      improvement: result.improvementDetails,
      searchedFlights: result.searchedFlights,
      foundInFlights: result.flightsWithThisBadge
    };
  });
  
  // Badges nach Monat
  seasonBadges.forEach(badge => {
    if (badge.achieved_at) {
      const month = new Date(badge.achieved_at).toLocaleDateString('de-DE', { 
        year: 'numeric', 
        month: 'long' 
      });
      stats.badgesByMonth[month] = (stats.badgesByMonth[month] || 0) + 1;
    }
  });
  
  // Top Badges (nach Anzahl)
  const badgeCounts = {};
  seasonBadges.forEach(badge => {
    const name = badge.name || badge.badge_id;
    badgeCounts[name] = (badgeCounts[name] || 0) + 1;
  });
  
  stats.topBadges = Object.entries(badgeCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  
  // Badges mit mehreren Vorkommen
  Object.entries(badgeCounts).forEach(([name, count]) => {
    if (count > 1) {
      stats.multipleOccurrences.push({ name, count });
    }
  });
  
  return stats;
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
    badgeResults: [],
    stats: {
      uniqueTypes: 0,
      totalPoints: 0,
      newTypes: 0,
      improvedTypes: 0,
      unchangedTypes: 0,
      badgesByMonth: {},
      topBadges: [],
      detailsByType: {},
      totalFlightsWithAchievements: 0,
      firstTimeTypes: 0,
      repeatedTypes: 0,
      multipleOccurrences: []
    },
    seasonBadgeCount: 0,
    seasonBadgeTypeCount: 0,
    flightsAnalyzed: 0,
    flightsBeforeSeason: 0,
    flightsWithBadges: 0
  };
}

/**
 * Debug-Funktion: Zeigt detaillierte Badge-Berechnung
 */
export function debugBadgeCalculation(badgeResults) {
  console.log('\n🔍 DETAILLIERTE BADGE-BERECHNUNG:');
  console.log('═══════════════════════════════════════════════════════');
  
  badgeResults.forEach(result => {
    console.log(`\n${result.badgeName} (${result.badgeId}):`);
    console.log(`├─ Typ: ${result.isMultiLevel ? 'Multi-Level' : 'Single-Level'}`);
    console.log(`├─ Flüge durchsucht: ${result.searchedFlights}`);
    console.log(`├─ Badge gefunden in: ${result.flightsWithThisBadge} Flügen`);
    
    if (result.foundPreSeason) {
      console.log(`├─ Vor Saison gefunden: ✅`);
      console.log(`│  ├─ Flug ID: ${result.lastPreSeasonFlightId}`);
      console.log(`│  ├─ Datum: ${result.lastPreSeasonFlightDate?.toLocaleDateString('de-DE')}`);
      console.log(`│  └─ Stand: Level ${result.preSeasonLevel} (${result.preSeasonPoints} Punkte)`);
    } else {
      console.log(`├─ Vor Saison gefunden: ❌`);
    }
    
    console.log(`├─ Aktueller Stand: Level ${result.currentLevel} (${result.totalCurrentPoints} Punkte)`);
    console.log(`├─ Saison-Punkte: ${result.seasonPoints}`);
    
    if (result.levelDetails && result.levelDetails.length > 0) {
      console.log(`└─ Neue Level:`);
      result.levelDetails.forEach(level => {
        console.log(`   └─ Level ${level.level}: ${level.value} = ${level.points} Punkt(e)`);
      });
    } else {
      console.log(`└─ ${result.improvementDetails}`);
    }
  });
  
  console.log('\n═══════════════════════════════════════════════════════\n');
}

/**
 * Test-Funktion für Badge-Berechnung
 */
export async function testBadgeCalculation(userId, pilotName) {
  console.log('\n🧪 TESTE BADGE-BERECHNUNG');
  console.log('═══════════════════════════════════════════════════════');
  
  const result = await calculateSeasonBadgesReverse(userId, pilotName);
  
  console.log('\n📊 TESTERGEBNIS:');
  console.log(`Pilot: ${result.pilotName} (ID: ${result.userId})`);
  console.log(`Saison-Badges: ${result.seasonBadgeCount}`);
  console.log(`Badge-Typen: ${result.seasonBadgeTypeCount}`);
  console.log(`Flüge analysiert: ${result.flightsAnalyzed}`);
  console.log(`Davon vor Saison: ${result.flightsBeforeSeason}`);
  
  if (result.badgeResults.length > 0) {
    debugBadgeCalculation(result.badgeResults);
  }
  
  return result;
}

/**
 * Cache leeren
 */
export function clearBadgeCache() {
  flightDetailsCache.clear();
  console.log('✅ Badge-Cache geleert');
}

// Export für Debugging
export { loadFlightDetails, SEASON_START, SEASON_END };