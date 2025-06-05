// /public/js/services/badge-reverse-calculator.js
/**
 * SG Säntis Cup - Badge Reverse Calculator
 * 
 * Berechnet Badges der Saison 2024/2025 durch Rückwärtssuche
 * Startet bei aktuellen Badges und zieht historische Punkte ab
 * 
 * Version 3.0
 */

import { apiClient } from './weglide-api-service.js';

const SEASON_END = new Date('2024-09-30');    // 30. September 2024
const SEASON_START = new Date('2024-10-01');  // 1. Oktober 2024
const DEBUG_MODE = false;

/**
 * Cache für Flugdetails
 */
const flightDetailsCache = new Map();

/**
 * Lädt Flugdetails mit Cache
 */
async function loadFlightDetails(flightId) {
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
 * Hauptfunktion: Berechnet Season-Badges durch Rückwärtssuche
 */
export async function calculateSeasonBadgesReverse(userId, pilotName) {
  console.log(`\n🔄 Starte Rückwärts-Badge-Berechnung für ${pilotName} (ID: ${userId})`);
  console.log(`   Saisongrenze: ${SEASON_END.toLocaleDateString()}`);
  
  try {
    // 1. Lade aktuelle Badges des Piloten
    const currentBadges = await apiClient.fetchUserAchievements(userId);
    
    if (!currentBadges || currentBadges.length === 0) {
      console.log(`   → Keine Badges gefunden`);
      return createEmptyResult(pilotName, userId);
    }
    
    console.log(`   → ${currentBadges.length} aktuelle Badge-Einträge gefunden`);
    
    // 2. Lade alle Flüge des Piloten
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
    
    // 5. Verarbeite jeden Badge-Typ einzeln
    for (const [badgeId, currentBadge] of badgesByType) {
      console.log(`\n   📍 Verarbeite Badge: ${currentBadge.badge?.name || badgeId}`);
      
      const result = await processBadgeWithReverseSearch(
        currentBadge,
        allFlights,
        SEASON_END
      );
      
      badgeResults.set(badgeId, result);
      
      // Füge Season-Badges zur Liste hinzu
      if (result.seasonPoints > 0) {
        // Erstelle Badge-Einträge entsprechend der Punkte
        for (let i = 0; i < result.seasonPoints; i++) {
          processedBadges.push({
            ...currentBadge,
            id: `${currentBadge.id}_season_${i + 1}`,
            badge_id: badgeId,
            name: currentBadge.badge?.name || badgeId,
            description: currentBadge.badge?.description || '',
            logo: currentBadge.badge?.logo || null,
            points: 1,
            level: result.currentLevel,
            value: result.currentValue,
            season_points: result.seasonPoints,
            pre_season_points: result.preSeasonPoints,
            is_multi_level: result.isMultiLevel,
            achieved_at: result.firstSeasonAchievement?.date,
            flight_id: result.firstSeasonAchievement?.flightId,
            season: '2024/2025',
            verified: true,
            point_index: i + 1,
            total_season_points: result.seasonPoints,
            improvement_details: result.improvementDetails
          });
        }
        
        console.log(`     ✅ ${result.seasonPoints} Punkte in Saison 24/25`);
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
    
    return {
      pilotName,
      userId,
      seasonBadges: processedBadges,
      badgeResults: Array.from(badgeResults.values()),
      stats,
      seasonBadgeCount: processedBadges.length,
      seasonBadgeTypeCount: stats.uniqueTypes,
      flightsAnalyzed: allFlights.length,
      flightsBeforeSeason: allFlights.filter(f => 
        new Date(f.scoring_date || f.takeoff_time) <= SEASON_END
      ).length
    };
    
  } catch (error) {
    console.error(`❌ Fehler bei Badge-Berechnung:`, error);
    return createEmptyResult(pilotName, userId);
  }
}

/**
 * Verarbeitet einen Badge-Typ mit Rückwärtssuche
 */
async function processBadgeWithReverseSearch(currentBadge, allFlights, seasonEnd) {
  const badgeId = currentBadge.badge_id;
  const badgeInfo = currentBadge.badge || {};
  const isMultiLevel = !!(badgeInfo.values || badgeInfo.points);
  
  // Aktueller Stand
  const currentValue = currentBadge.value || 0;
  const currentPoints = currentBadge.points || 1;
  let currentLevel = 0;
  
  // Bei Multi-Level: Finde aktuelles Level
  if (isMultiLevel && badgeInfo.values) {
    for (let i = badgeInfo.values.length - 1; i >= 0; i--) {
      if (currentValue >= badgeInfo.values[i]) {
        currentLevel = i + 1;
        break;
      }
    }
  }
  
  console.log(`     Aktuell: Level ${currentLevel}, Wert ${currentValue}, ${currentPoints} Punkte`);
  
  // Rückwärtssuche in Flügen
  let foundPreSeasonAchievement = false;
  let preSeasonValue = 0;
  let preSeasonLevel = 0;
  let preSeasonPoints = 0;
  let firstSeasonAchievement = null;
  
  // Durchsuche Flüge rückwärts (neueste zuerst)
  for (const flight of allFlights) {
    const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
    
    // Überspringe Flüge nach Saisonende
    if (flightDate > seasonEnd) {
      // Prüfe ob dieser Flug das erste Season-Achievement enthält
      if (!firstSeasonAchievement && flightDate >= SEASON_START) {
        const flightDetails = await loadFlightDetails(flight.id);
        if (flightDetails?.achievements) {
          const achievement = flightDetails.achievements.find(a => a.badge_id === badgeId);
          if (achievement) {
            firstSeasonAchievement = {
              flightId: flight.id,
              date: flightDate,
              value: achievement.value
            };
          }
        }
      }
      continue;
    }
    
    // Lade Flugdetails
    const flightDetails = await loadFlightDetails(flight.id);
    if (!flightDetails || !flightDetails.achievements) continue;
    
    // Suche nach diesem Badge in den Achievements
    const achievement = flightDetails.achievements.find(a => a.badge_id === badgeId);
    if (!achievement) continue;
    
    console.log(`     🔍 Gefunden in Flug vom ${flightDate.toLocaleDateString()}: Wert ${achievement.value}`);
    
    // Bei Multi-Level Badge
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
      
      console.log(`     📌 Pre-Season: Level ${preSeasonLevel}, ${preSeasonPoints} Punkte`);
    } else {
      // Single-Level Badge
      preSeasonPoints = 1;
      console.log(`     📌 Single-Level Badge bereits vor Saison erreicht`);
    }
    
    foundPreSeasonAchievement = true;
    break; // Stoppe Suche nach erstem Fund
  }
  
  // Berechne Season-Punkte
  let seasonPoints = 0;
  let improvementDetails = '';
  
  if (isMultiLevel) {
    // Multi-Level: Ziehe Pre-Season Punkte ab
    const totalCurrentPoints = calculateTotalPoints(currentLevel, badgeInfo.points);
    seasonPoints = Math.max(0, totalCurrentPoints - preSeasonPoints);
    
    if (seasonPoints > 0) {
      improvementDetails = `Level ${preSeasonLevel} → ${currentLevel} (+${seasonPoints} Punkte)`;
    }
  } else {
    // Single-Level: 1 Punkt wenn neu in der Saison
    seasonPoints = foundPreSeasonAchievement ? 0 : 1;
    
    if (seasonPoints > 0) {
      improvementDetails = 'Erstmalig in Saison 24/25 erreicht';
    }
  }
  
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
    totalCurrentPoints: isMultiLevel ? calculateTotalPoints(currentLevel, badgeInfo.points) : 1,
    foundPreSeason: foundPreSeasonAchievement,
    firstSeasonAchievement,
    improvementDetails
  };
}

/**
 * Berechnet die Gesamtpunkte für ein Level
 */
function calculateTotalPoints(level, pointsArray) {
  if (!pointsArray || !Array.isArray(pointsArray)) {
    return level; // Fallback: 1 Punkt pro Level
  }
  
  let total = 0;
  for (let i = 0; i < level && i < pointsArray.length; i++) {
    total += pointsArray[i] || 1;
  }
  return total;
}

/**
 * Lädt alle Flüge eines Users
 */
async function loadAllUserFlights(userId) {
  const allFlights = [];
  const currentYear = new Date().getFullYear();
  
  // Lade Flüge für mehrere Jahre
  const yearsToLoad = [currentYear, currentYear - 1, currentYear - 2];
  
  for (const year of yearsToLoad) {
    try {
      const flights = await apiClient.fetchUserFlights(userId, year);
      if (Array.isArray(flights)) {
        allFlights.push(...flights);
      }
    } catch (error) {
      console.warn(`Fehler beim Laden der Flüge für ${year}:`, error.message);
    }
  }
  
  // Entferne Duplikate
  const uniqueFlights = Array.from(
    new Map(allFlights.map(f => [f.id, f])).values()
  );
  
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
    badgesByMonth: {},
    topBadges: []
  };
  
  // Analysiere Badge-Results
  badgeResults.forEach(result => {
    if (result.seasonPoints > 0) {
      if (!result.foundPreSeason) {
        stats.newTypes++;
      } else if (result.isMultiLevel) {
        stats.improvedTypes++;
      }
    }
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
  
  // Top Badges
  const badgeCounts = {};
  seasonBadges.forEach(badge => {
    const name = badge.name || badge.badge_id;
    badgeCounts[name] = (badgeCounts[name] || 0) + 1;
  });
  
  stats.topBadges = Object.entries(badgeCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  
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
    badgeResults: [],
    stats: {
      uniqueTypes: 0,
      totalPoints: 0,
      newTypes: 0,
      improvedTypes: 0,
      badgesByMonth: {},
      topBadges: []
    },
    seasonBadgeCount: 0,
    seasonBadgeTypeCount: 0,
    flightsAnalyzed: 0,
    flightsBeforeSeason: 0
  };
}

/**
 * Debug-Funktion: Zeigt Badge-Verlauf
 */
export function debugBadgeHistory(badgeResults) {
  console.log('\n🔍 Badge-Verlauf Debug:');
  console.log('═══════════════════════════════════════════════');
  
  badgeResults.forEach(result => {
    console.log(`\n${result.badgeName}:`);
    console.log(`  Typ: ${result.isMultiLevel ? 'Multi-Level' : 'Single-Level'}`);
    
    if (result.isMultiLevel) {
      console.log(`  Vor Saison: Level ${result.preSeasonLevel} (${result.preSeasonPoints} Punkte)`);
      console.log(`  Aktuell: Level ${result.currentLevel} (${result.totalCurrentPoints} Punkte)`);
      console.log(`  → Saison 24/25: +${result.seasonPoints} Punkte`);
    } else {
      console.log(`  Vor Saison: ${result.foundPreSeason ? 'Bereits erreicht' : 'Nicht erreicht'}`);
      console.log(`  → Saison 24/25: ${result.seasonPoints > 0 ? 'NEU erreicht!' : 'Keine Änderung'}`);
    }
    
    if (result.improvementDetails) {
      console.log(`  Details: ${result.improvementDetails}`);
    }
  });
  
  console.log('\n═══════════════════════════════════════════════');
}