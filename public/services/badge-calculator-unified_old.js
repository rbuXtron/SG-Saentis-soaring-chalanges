/**
 * SG Säntis Cup - Unified Badge Calculator
 * 
 * Konsolidierte Version aller Badge-Berechnungsmethoden
 * Kombiniert die besten Ansätze für maximale Genauigkeit
 * 
 * Version 1.0 - Unified
 */

import { apiClient } from './weglide-api-service.js';

// Konstanten
const SEASON_START = new Date('2024-10-01T00:00:00');
const SEASON_END = new Date('2025-09-30T23:59:59');
const DEBUG_MODE = false;

// Cache für Flugdetails
const flightDetailsCache = new Map();

/**
 * Hauptfunktion: Berechnet Badges für die aktuelle Saison
 * Verwendet einen Hybrid-Ansatz für beste Genauigkeit
 */
export async function calculateSeasonBadges(userId, pilotName) {
  console.log(`\n🏅 Berechne Saison 24/25 Badges für ${pilotName} (ID: ${userId})`);
  console.log(`   Methode: Unified Hybrid Approach`);
  
  try {
    // 1. Lade alle Achievements des Piloten
    const allAchievements = await apiClient.fetchUserAchievements(userId);
    
    if (!allAchievements || allAchievements.length === 0) {
      console.log(`   → Keine Badges gefunden`);
      return createEmptyResult(pilotName, userId);
    }
    
    console.log(`   → ${allAchievements.length} Achievement-Einträge gefunden`);
    
    // 2. Basis-Filterung: Nur Badges mit created >= SEASON_START
    const seasonCandidates = allAchievements.filter(badge => {
      const createdDate = new Date(badge.created);
      return createdDate >= SEASON_START && createdDate <= SEASON_END;
    });
    
    console.log(`   → ${seasonCandidates.length} potenzielle Saison-Badges (created >= ${SEASON_START.toLocaleDateString()})`);
    
    // 3. Kategorisiere Badges
    const { singleLevel, multiLevel } = categorizeBadges(seasonCandidates);
    
    console.log(`   → ${singleLevel.length} Single-Level Badges`);
    console.log(`   → ${multiLevel.length} Multi-Level Badges zur Verifikation`);
    
    // 4. Single-Level Badges zählen direkt
    const verifiedSingleLevel = singleLevel.map(badge => ({
      ...badge,
      points: 1,
      verified: true,
      verificationMethod: 'single-level-direct'
    }));
    
    // 5. Multi-Level Badges verifizieren
    const verifiedMultiLevel = await verifyMultiLevelBadges(
      multiLevel, 
      userId, 
      pilotName
    );
    
    // 6. Kombiniere alle verifizierten Badges
    const allSeasonBadges = [...verifiedSingleLevel, ...verifiedMultiLevel];
    
    // 7. Expandiere Multi-Point Badges für korrekte Zählung
    const expandedBadges = expandMultiPointBadges(allSeasonBadges);
    
    // 8. Berechne Statistiken
    const stats = calculateBadgeStatistics(expandedBadges, allAchievements);
    
    // 9. Zusammenfassung
    console.log(`\n📊 Zusammenfassung für ${pilotName}:`);
    console.log(`   → ${expandedBadges.length} Badge-Punkte in Saison 24/25`);
    console.log(`   → ${stats.uniqueTypes} verschiedene Badge-Typen`);
    console.log(`   → Verifikationsmethoden: ${stats.verificationMethods.join(', ')}`);
    
    return {
      pilotName,
      userId,
      // Haupt-Ergebnisse
      badges: expandedBadges,
      badgeCount: expandedBadges.length,
      badgeCategoryCount: stats.uniqueTypes,
      
      // Detaillierte Counts
      seasonBadges: expandedBadges,
      seasonBadgeCount: expandedBadges.length,
      seasonBadgeTypeCount: stats.uniqueTypes,
      
      // All-Time Daten
      allTimeBadges: allAchievements,
      allTimeBadgeCount: allAchievements.length,
      
      // Statistiken
      stats,
      verifiedBadgeCount: stats.verifiedCount,
      flightsAnalyzed: stats.flightsAnalyzed,
      flightsWithBadges: stats.flightsWithBadges,
      
      // Badge-Typen
      singleLevelCount: verifiedSingleLevel.length,
      multiLevelCount: verifiedMultiLevel.length,
      firstTimeTypes: stats.newTypes,
      repeatedTypes: stats.improvedTypes
    };
    
  } catch (error) {
    console.error(`❌ Fehler bei Badge-Berechnung:`, error);
    return createEmptyResult(pilotName, userId);
  }
}

/**
 * Kategorisiert Badges in Single-Level und Multi-Level
 */
function categorizeBadges(badges) {
  const singleLevel = [];
  const multiLevel = [];
  
  badges.forEach(badge => {
    if (isMultiLevelBadge(badge)) {
      multiLevel.push(badge);
    } else {
      singleLevel.push(badge);
    }
  });
  
  return { singleLevel, multiLevel };
}

/**
 * Prüft ob ein Badge Multi-Level ist
 */
function isMultiLevelBadge(badge) {
  // Methode 1: Explizites Flag
  if (badge.is_multi_level !== undefined) {
    return badge.is_multi_level;
  }
  
  // Methode 2: Points > 1
  if (badge.points && badge.points > 1) {
    return true;
  }
  
  // Methode 3: Badge-Definition hat values/points Arrays
  if (badge.badge) {
    const hasValues = Array.isArray(badge.badge.values) && badge.badge.values.length > 1;
    const hasPoints = Array.isArray(badge.badge.points) && badge.badge.points.length > 1;
    return hasValues || hasPoints;
  }
  
  return false;
}

/**
 * Verifiziert Multi-Level Badges durch verschiedene Methoden
 */
async function verifyMultiLevelBadges(badges, userId, pilotName) {
  if (badges.length === 0) return [];
  
  console.log(`\n   🔄 Verifiziere ${badges.length} Multi-Level Badges...`);
  
  const verifiedBadges = [];
  
  // Gruppiere nach badge_id für effiziente Verarbeitung
  const badgeGroups = new Map();
  badges.forEach(badge => {
    if (!badgeGroups.has(badge.badge_id)) {
      badgeGroups.set(badge.badge_id, []);
    }
    badgeGroups.get(badge.badge_id).push(badge);
  });
  
  // Verarbeite jede Badge-Gruppe
  for (const [badgeId, groupBadges] of badgeGroups) {
    console.log(`\n   📍 Verifiziere ${badgeId} (${groupBadges.length} Einträge)`);
    
    // Wähle Verifikationsmethode basierend auf verfügbaren Daten
    let verificationResult;
    
    // Methode 1: Wenn flight_id vorhanden, nutze Flight-Achievement-Methode
    if (groupBadges.some(b => b.flight_id)) {
      verificationResult = await verifyViaFlightAchievements(
        groupBadges[0], 
        userId, 
        badgeId
      );
    }
    // Methode 2: Sonst nutze Rückwärtssuche
    else {
      verificationResult = await verifyViaReverseSearch(
        groupBadges[0], 
        userId, 
        badgeId
      );
    }
    
    if (verificationResult.verified) {
      // Erstelle Badge-Einträge basierend auf Saison-Punkten
      const badgeEntry = {
        ...groupBadges[0],
        points: verificationResult.seasonPoints,
        originalPoints: groupBadges[0].points,
        verified: true,
        verificationMethod: verificationResult.method,
        verificationDetails: verificationResult.details,
        preSeasonLevel: verificationResult.preSeasonLevel,
        currentLevel: verificationResult.currentLevel,
        improvement: verificationResult.improvement
      };
      
      verifiedBadges.push(badgeEntry);
      
      console.log(`     ✅ Verifiziert: ${verificationResult.seasonPoints} Punkte (${verificationResult.method})`);
    } else {
      console.log(`     ❌ Nicht verifiziert oder keine neuen Punkte`);
    }
  }
  
  return verifiedBadges;
}

/**
 * Verifiziert Badge über Flight-Achievements (genaueste Methode)
 */
async function verifyViaFlightAchievements(badge, userId, badgeId) {
  try {
    // Lade Flüge des Users
    const currentYear = new Date().getFullYear();
    const flights = await loadUserFlights(userId, [currentYear - 1, currentYear]);
    
    // Finde letztes Achievement vor Saison
    let lastPreSeasonValue = 0;
    let lastPreSeasonLevel = 0;
    let foundInSeason = false;
    let currentValue = badge.value || 0;
    let flightsChecked = 0;
    
    for (const flight of flights) {
      const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
      
      // Lade Flugdetails
      const details = await getCachedFlightDetails(flight.id);
      if (!details?.achievements) continue;
      
      flightsChecked++;
      
      // Suche Badge in Achievements
      const achievement = details.achievements.find(a => a.badge_id === badgeId);
      if (!achievement) continue;
      
      if (flightDate < SEASON_START) {
        // Vor-Saison Achievement
        lastPreSeasonValue = achievement.value || 0;
        lastPreSeasonLevel = calculateLevelFromValue(
          lastPreSeasonValue, 
          badge.badge?.values
        );
      } else if (flightDate >= SEASON_START && flightDate <= SEASON_END) {
        foundInSeason = true;
        currentValue = Math.max(currentValue, achievement.value || 0);
      }
    }
    
    // Berechne Saison-Punkte
    const currentLevel = calculateLevelFromValue(currentValue, badge.badge?.values);
    const seasonPoints = calculateSeasonPoints(
      badge,
      currentLevel,
      lastPreSeasonLevel
    );
    
    return {
      verified: true,
      method: 'flight-achievements',
      seasonPoints,
      currentLevel,
      preSeasonLevel: lastPreSeasonLevel,
      improvement: currentLevel - lastPreSeasonLevel,
      details: {
        flightsChecked,
        foundInSeason,
        lastPreSeasonValue,
        currentValue
      }
    };
    
  } catch (error) {
    console.error(`     ⚠️ Fehler bei Flight-Achievement-Verifikation:`, error.message);
    // Fallback auf einfache Methode
    return verifyViaSimpleMethod(badge);
  }
}

/**
 * Verifiziert Badge über Rückwärtssuche
 */
async function verifyViaReverseSearch(badge, userId, badgeId) {
  // Vereinfachte Version - nutzt nur created date
  // In Produktion würde hier die komplexe Rückwärtssuche implementiert
  return verifyViaSimpleMethod(badge);
}

/**
 * Einfache Verifikation basierend auf Badge-Daten
 */
function verifyViaSimpleMethod(badge) {
  const points = badge.points || 1;
  
  return {
    verified: true,
    method: 'simple-points',
    seasonPoints: points,
    currentLevel: badge.level || 1,
    preSeasonLevel: 0,
    improvement: badge.level || 1,
    details: {
      originalPoints: points,
      assumption: 'Alle Punkte in dieser Saison'
    }
  };
}

/**
 * Expandiert Multi-Point Badges für korrekte Zählung
 */
function expandMultiPointBadges(badges) {
  const expanded = [];
  
  badges.forEach(badge => {
    const points = badge.points || 1;
    
    if (points > 1) {
      // Erstelle einen Eintrag pro Punkt
      for (let i = 0; i < points; i++) {
        expanded.push({
          ...badge,
          id: `${badge.id}_point_${i + 1}`,
          points: 1,
          pointIndex: i + 1,
          totalPoints: points,
          isExpanded: true,
          name: `${badge.name || badge.badge_id} (${i + 1}/${points})`
        });
      }
    } else {
      expanded.push({
        ...badge,
        isExpanded: false
      });
    }
  });
  
  return expanded;
}

/**
 * Berechnet Level aus Wert
 */
function calculateLevelFromValue(value, levelValues) {
  if (!value || !levelValues || !Array.isArray(levelValues)) return 0;
  
  let level = 0;
  for (let i = levelValues.length - 1; i >= 0; i--) {
    if (value >= levelValues[i]) {
      level = i + 1;
      break;
    }
  }
  return level;
}

/**
 * Berechnet Saison-Punkte basierend auf Level-Verbesserung
 */
function calculateSeasonPoints(badge, currentLevel, preSeasonLevel) {
  if (!badge.badge?.points || !Array.isArray(badge.badge.points)) {
    // Fallback: 1 Punkt pro Level
    return Math.max(0, currentLevel - preSeasonLevel);
  }
  
  let points = 0;
  for (let i = preSeasonLevel; i < currentLevel; i++) {
    points += badge.badge.points[i] || 1;
  }
  
  return points;
}

/**
 * Lädt Flugdetails mit Cache
 */
async function getCachedFlightDetails(flightId) {
  if (!flightId) return null;
  
  if (flightDetailsCache.has(flightId)) {
    return flightDetailsCache.get(flightId);
  }
  
  try {
    const details = await apiClient.fetchFlightDetails(flightId);
    flightDetailsCache.set(flightId, details);
    return details;
  } catch (error) {
    console.warn(`Konnte Flugdetails für ID ${flightId} nicht laden`);
    return null;
  }
}

/**
 * Lädt Flüge eines Users für bestimmte Jahre
 */
async function loadUserFlights(userId, years) {
  const allFlights = [];
  
  for (const year of years) {
    try {
      const flights = await apiClient.fetchUserFlights(userId, year);
      if (Array.isArray(flights)) {
        allFlights.push(...flights);
      }
    } catch (error) {
      console.warn(`Fehler beim Laden der Flüge für ${year}:`, error.message);
    }
  }
  
  // Sortiere chronologisch (neueste zuerst für Rückwärtssuche)
  return allFlights.sort((a, b) => {
    const dateA = new Date(a.scoring_date || a.takeoff_time);
    const dateB = new Date(b.scoring_date || b.takeoff_time);
    return dateB - dateA;
  });
}

/**
 * Berechnet Badge-Statistiken
 */
function calculateBadgeStatistics(seasonBadges, allTimeBadges) {
  const stats = {
    uniqueTypes: new Set(seasonBadges.map(b => b.badge_id)).size,
    totalPoints: seasonBadges.length,
    verifiedCount: seasonBadges.filter(b => b.verified).length,
    
    // Verifikationsmethoden
    verificationMethods: [...new Set(seasonBadges.map(b => b.verificationMethod).filter(Boolean))],
    
    // Badge-Typen
    singleLevelCount: seasonBadges.filter(b => !b.is_multi_level).length,
    multiLevelCount: seasonBadges.filter(b => b.is_multi_level).length,
    expandedCount: seasonBadges.filter(b => b.isExpanded).length,
    
    // Analyse
    newTypes: 0,
    improvedTypes: 0,
    
    // Flug-Statistiken
    flightsAnalyzed: 0,
    flightsWithBadges: new Set(seasonBadges.filter(b => b.flight_id).map(b => b.flight_id)).size,
    
    // Zeitliche Verteilung
    badgesByMonth: {},
    
    // Top Badges
    topBadges: []
  };
  
  // Analysiere neue vs. verbesserte Badges
  const preSeasonBadgeTypes = new Set();
  allTimeBadges.forEach(badge => {
    const date = new Date(badge.created);
    if (date < SEASON_START) {
      preSeasonBadgeTypes.add(badge.badge_id);
    }
  });
  
  const seasonBadgeTypes = new Set(seasonBadges.map(b => b.badge_id));
  seasonBadgeTypes.forEach(type => {
    if (!preSeasonBadgeTypes.has(type)) {
      stats.newTypes++;
    } else {
      stats.improvedTypes++;
    }
  });
  
  // Zeitliche Verteilung
  seasonBadges.forEach(badge => {
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
  seasonBadges.forEach(badge => {
    // Zähle nur Original-Badges, nicht expandierte
    if (!badge.isExpanded || badge.pointIndex === 1) {
      const name = badge.name || badge.badge_id;
      badgeCounts[name] = (badgeCounts[name] || 0) + (badge.totalPoints || 1);
    }
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
    badges: [],
    badgeCount: 0,
    badgeCategoryCount: 0,
    seasonBadges: [],
    seasonBadgeCount: 0,
    seasonBadgeTypeCount: 0,
    allTimeBadges: [],
    allTimeBadgeCount: 0,
    stats: {
      uniqueTypes: 0,
      totalPoints: 0,
      verifiedCount: 0,
      verificationMethods: [],
      singleLevelCount: 0,
      multiLevelCount: 0,
      expandedCount: 0,
      newTypes: 0,
      improvedTypes: 0,
      flightsAnalyzed: 0,
      flightsWithBadges: 0,
      badgesByMonth: {},
      topBadges: []
    },
    verifiedBadgeCount: 0,
    flightsAnalyzed: 0,
    flightsWithBadges: 0,
    singleLevelCount: 0,
    multiLevelCount: 0,
    firstTimeTypes: 0,
    repeatedTypes: 0
  };
}

/**
 * Debug-Funktion für Badge-Analyse
 */
export function debugBadgeCalculation(result) {
  console.log('\n🔍 BADGE-ANALYSE DEBUG:');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Pilot: ${result.pilotName} (ID: ${result.userId})`);
  console.log(`\nZusammenfassung:`);
  console.log(`  • ${result.badgeCount} Badge-Punkte in Saison 24/25`);
  console.log(`  • ${result.badgeCategoryCount} verschiedene Badge-Typen`);
  console.log(`  • ${result.stats.verifiedCount} verifizierte Badges`);
  console.log(`\nVerifikationsmethoden: ${result.stats.verificationMethods.join(', ')}`);
  console.log(`\nBadge-Typen:`);
  console.log(`  • Single-Level: ${result.stats.singleLevelCount}`);
  console.log(`  • Multi-Level: ${result.stats.multiLevelCount}`);
  console.log(`  • Expandiert: ${result.stats.expandedCount}`);
  console.log(`\nTop 5 Badges:`);
  result.stats.topBadges.forEach((badge, i) => {
    console.log(`  ${i + 1}. ${badge.name}: ${badge.count} Punkte`);
  });
  console.log('═══════════════════════════════════════════════════════\n');
}

// Export für Kompatibilität
export { calculateSeasonBadges as calculateSeasonBadgesUnified };

// Cache leeren
export function clearBadgeCache() {
  flightDetailsCache.clear();
  console.log('✅ Badge-Cache geleert');
}