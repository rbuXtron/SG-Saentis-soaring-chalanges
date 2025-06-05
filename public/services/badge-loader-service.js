/**
 * SG Säntis Cup - Badge Loader Service
 * 
 * Version 7.0 - Mit Saison-Support (Oktober - September)
 * Berücksichtigt Badges ab Oktober 2024 für Saison 2024/2025
 */

import { apiClient } from './weglide-api-service.js';

// Konstanten
const SEASON_START_DATE = new Date('2024-10-01'); // Saisonbeginn Oktober 2024
const SEASON_START_YEAR = 2024;
const SEASON_START_MONTH = 10; // Oktober
const CURRENT_YEAR = new Date().getFullYear();
const DEBUG_MODE = false;

/**
 * Cache für Flugdetails
 */
const flightDetailsCache = new Map();

/**
 * Prüft ob ein Datum in der aktuellen Saison liegt (ab Oktober 2024)
 */
function isInCurrentSeason(dateString) {
  if (!dateString) return false;
  
  const date = new Date(dateString);
  return date >= SEASON_START_DATE;
}

/**
 * Ermittelt die Saison für ein Datum
 * Oktober-September = eine Saison
 */
function getSeasonForDate(dateString) {
  if (!dateString) return null;
  
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // JavaScript months are 0-based
  
  // Wenn Oktober oder später, gehört es zur Saison des aktuellen Jahres
  // Wenn vor Oktober, gehört es zur Saison des Vorjahres
  if (month >= 10) {
    return `${year}/${year + 1}`;
  } else {
    return `${year - 1}/${year}`;
  }
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
 * Lädt alle Flüge eines Piloten für die angegebenen Jahre
 */
async function loadPilotFlightsForYears(userId, years) {
  const allFlights = [];
  
  for (const year of years) {
    try {
      if (DEBUG_MODE) console.log(`      Lade Flüge für Jahr ${year}...`);
      const flights = await apiClient.fetchUserFlights(userId, year);
      if (Array.isArray(flights)) {
        allFlights.push(...flights);
        if (DEBUG_MODE) console.log(`      → ${flights.length} Flüge in ${year}`);
      }
    } catch (error) {
      console.warn(`Fehler beim Laden der Flüge für Jahr ${year}:`, error);
    }
  }
  
  return allFlights;
}

/**
 * Extrahiert Badge-Level Erreichungen aus einem Flug
 */
async function extractBadgeAchievementsFromFlight(flightId) {
  const flightDetails = await getCachedFlightDetails(flightId);
  if (!flightDetails) return [];
  
  const achievements = [];
  
  // Prüfe achievements Array im Flug
  if (flightDetails.achievements && Array.isArray(flightDetails.achievements)) {
    flightDetails.achievements.forEach(achievement => {
      if (achievement.badge_id && achievement.value !== undefined) {
        achievements.push({
          badge_id: achievement.badge_id,
          value: achievement.value,
          flight_id: flightId,
          date: flightDetails.scoring_date || flightDetails.landing_time || flightDetails.takeoff_time,
          year: new Date(flightDetails.scoring_date || flightDetails.landing_time || flightDetails.takeoff_time).getFullYear()
        });
      }
    });
  }
  
  return achievements;
}

/**
 * Debug-Funktion für Badge-Struktur
 */
async function debugBadgeStructure(badgeData) {
  if (!DEBUG_MODE) return;
  
  console.log(`\n🔍 BADGE ANALYSE: ${badgeData.badge_id}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Badge-Info - mit Null-Checks
  if (badgeData.badge) {
    console.log('Badge Info:', {
      name: badgeData.badge.name || 'N/A',
      has_values: !!badgeData.badge.values,
      values_count: Array.isArray(badgeData.badge.values) ? badgeData.badge.values.length : 0,
      values: badgeData.badge.values || 'keine',
      has_points: !!badgeData.badge.points,
      points_count: Array.isArray(badgeData.badge.points) ? badgeData.badge.points.length : 0,
      points: badgeData.badge.points || 'keine'
    });
  } else {
    console.log('Badge Info: Keine Badge-Details vorhanden');
  }
  
  // Ist es ein Multi-Level Badge?
  const isMultiLevel = isMultiLevelBadge(badgeData);
  console.log(`Multi-Level Badge: ${isMultiLevel ? '✅ JA' : '❌ NEIN'}`);
  
  if (isMultiLevel && badgeData.badge) {
    console.log('\nLevel-Struktur:');
    
    // Sicherer Zugriff auf values und points
    const values = badgeData.badge.values || [];
    const points = badgeData.badge.points || [];
    
    if (Array.isArray(values) && values.length > 0) {
      values.forEach((value, index) => {
        const pointValue = Array.isArray(points) && points[index] !== undefined ? points[index] : 'N/A';
        console.log(`  Level ${index + 1}: ${value} = ${pointValue} Punkte`);
      });
    } else {
      console.log('  Keine Level-Werte definiert');
    }
  }
  
  // Aktueller Wert
  console.log('\nAktueller Status:', {
    value: badgeData.value || 'N/A',
    points: badgeData.points || 0,
    created: badgeData.created || 'N/A',
    flight_id: badgeData.flight_id || 'N/A',
    season: getSeasonForDate(badgeData.created),
    in_current_season: isInCurrentSeason(badgeData.created)
  });
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Prüft ob ein Badge ein Multi-Level Badge ist
 */
function isMultiLevelBadge(badgeData) {
  if (!badgeData || !badgeData.badge) return false;
  
  const hasValues = Array.isArray(badgeData.badge.values) && badgeData.badge.values.length > 0;
  const hasPoints = Array.isArray(badgeData.badge.points) && badgeData.badge.points.length > 0;
  
  // Einige Badges haben nur values ohne points oder umgekehrt
  return hasValues || hasPoints;
}

/**
 * Verarbeitet Multi-Level Badges mit Saison-Historie
 */
async function processMultiLevelBadgeWithSeasonHistory(badgeData, seasonStartDate, userId) {
  const expandedBadges = [];
  
  if (!badgeData) {
    console.warn(`⚠️ Keine Badge-Daten für Verarbeitung`);
    return expandedBadges;
  }
  
  const badgeInfo = badgeData.badge;
  
  // Debug-Ausgabe
  try {
    await debugBadgeStructure(badgeData);
  } catch (error) {
    console.error(`Fehler bei Debug-Ausgabe für Badge ${badgeData.badge_id}:`, error);
  }
  
  if (!isMultiLevelBadge(badgeData)) {
    // Single-Level Badge
    const badgeDate = badgeData.created;
    const inCurrentSeason = isInCurrentSeason(badgeDate);
    const season = getSeasonForDate(badgeDate);
    
    if (DEBUG_MODE) {
      console.log(`  ❌ ${badgeData.badge_id} ist kein Multi-Level Badge`);
      console.log(`     Saison: ${season}, In aktueller Saison: ${inCurrentSeason}`);
    }
    
    const processedBadge = {
      ...badgeData,
      is_multi_level: false,
      logo: badgeData.badge?.logo || null,
      name: badgeData.badge?.name || badgeData.badge_id || 'Unbekanntes Badge',
      achieved_at: badgeDate,
      season: season,
      in_current_season: inCurrentSeason,
      year: badgeDate ? new Date(badgeDate).getFullYear() : null,
      points: badgeData.points || 1  // Standard 1 Punkt für Single-Level
    };
    
    if (inCurrentSeason) {
      return [processedBadge];
    }
    return [];
  }
  
  // Multi-Level Badge Verarbeitung
  const values = Array.isArray(badgeInfo?.values) ? badgeInfo.values : [];
  const points = Array.isArray(badgeInfo?.points) ? badgeInfo.points : [];
  
  if (DEBUG_MODE) {
    console.log(`  ✅ ${badgeData.badge_id} ist ein Multi-Level Badge mit ${values.length} Levels`);
  }
  
  // Lade ALLE Flüge seit 2023 für vollständige Historie
  const yearsToCheck = [2023, 2024, 2025];
  const allFlights = await loadPilotFlightsForYears(userId, yearsToCheck);
  
  // Sammle alle Badge-Achievements
  const allAchievements = [];
  for (const flight of allFlights) {
    if (flight.id) {
      const achievements = await extractBadgeAchievementsFromFlight(flight.id);
      allAchievements.push(...achievements);
    }
  }
  
  // Fallback wenn keine Flight-Achievements gefunden
  const thisBadgeAchievements = allAchievements.filter(a => a.badge_id === badgeData.badge_id);
  
  if (thisBadgeAchievements.length === 0 && badgeData.value !== undefined) {
    const date = badgeData.created;
    const season = getSeasonForDate(date);
    
    if (DEBUG_MODE) {
      console.log(`    ⚠️ Keine Flight-Achievements, nutze Badge-Wert: ${badgeData.value}`);
      console.log(`       Datum: ${date}, Saison: ${season}`);
    }
    
    thisBadgeAchievements.push({
      badge_id: badgeData.badge_id,
      value: badgeData.value,
      date: date,
      year: date ? new Date(date).getFullYear() : null,
      season: season
    });
  }
  
  // Gruppiere nach Saison
  const achievementsBySeason = {};
  thisBadgeAchievements.forEach(achievement => {
    const season = getSeasonForDate(achievement.date) || 'Unbekannt';
    if (!achievementsBySeason[season]) {
      achievementsBySeason[season] = [];
    }
    achievementsBySeason[season].push(achievement);
  });
  
  if (DEBUG_MODE) {
    console.log(`    Achievements nach Saisons:`, Object.keys(achievementsBySeason));
  }
  
  // WICHTIG: Finde höchsten Level VOR aktueller Saison (vor Oktober 2024)
  let previousMaxLevel = -1;
  let previousMaxValue = 0;
  let previousTotalPoints = 0;
  
  // Prüfe alle vergangenen Saisons
  const pastSeasons = ['2022/2023', '2023/2024'];
  pastSeasons.forEach(season => {
    if (achievementsBySeason[season]) {
      achievementsBySeason[season].forEach(achievement => {
        if (achievement.value > previousMaxValue) {
          previousMaxValue = achievement.value;
          // Finde den Level für diesen Wert
          for (let i = values.length - 1; i >= 0; i--) {
            if (achievement.value >= values[i]) {
              previousMaxLevel = i;
              break;
            }
          }
        }
      });
    }
  });
  
  // Berechne Punkte die bereits vor der Saison erreicht wurden
  if (previousMaxLevel >= 0) {
    for (let i = 0; i <= previousMaxLevel; i++) {
      previousTotalPoints += (points[i] || 1);
    }
    if (DEBUG_MODE) {
      console.log(`    Vor Saison 24/25: Level ${previousMaxLevel + 1} erreicht = ${previousTotalPoints} Punkte`);
    }
  }
  
  // Finde aktuellen Level in Saison 2024/2025
  let currentSeasonMaxLevel = -1;
  let currentSeasonMaxValue = 0;
  let currentSeasonAchievement = null;
  
  const currentSeason = '2024/2025';
  if (achievementsBySeason[currentSeason]) {
    achievementsBySeason[currentSeason].forEach(achievement => {
      if (achievement.value > currentSeasonMaxValue) {
        currentSeasonMaxValue = achievement.value;
        currentSeasonAchievement = achievement;
        for (let i = values.length - 1; i >= 0; i--) {
          if (achievement.value >= values[i]) {
            currentSeasonMaxLevel = i;
            break;
          }
        }
      }
    });
    
    if (DEBUG_MODE && currentSeasonMaxLevel >= 0) {
      console.log(`    Saison 24/25: Level ${currentSeasonMaxLevel + 1} (Wert: ${currentSeasonMaxValue})`);
    }
  }
  
  // WICHTIG: Erstelle nur NEUE Level (über vorherige Saisons)
  let newPointsThisSeason = 0;
  
  if (currentSeasonMaxLevel > previousMaxLevel && currentSeasonAchievement) {
    // Für jeden neuen Level
    for (let i = previousMaxLevel + 1; i <= currentSeasonMaxLevel; i++) {
      const levelPoints = points[i] || 1;
      newPointsThisSeason += levelPoints;
      
      // WICHTIG: Erstelle Badge-Einträge entsprechend der Punkte
      for (let pointIndex = 0; pointIndex < levelPoints; pointIndex++) {
        const levelBadge = {
          ...badgeData,
          id: `${badgeData.id}_L${i + 1}_P${pointIndex + 1}_S2425`,
          level: i + 1,
          level_value: values[i],
          level_points: levelPoints,
          points: 1, // Jeder Badge-Eintrag zählt als 1
          is_multi_level: true,
          total_levels: values.length,
          name: `${badgeData.badge.name} Level ${i + 1}${levelPoints > 1 ? ` (${pointIndex + 1}/${levelPoints})` : ''} (${values[i]}${getUnitForBadgeType(badgeData.badge_id)})`,
          original_name: badgeData.badge.name,
          logo: badgeData.badge?.logo || null,
          achieved_at: currentSeasonAchievement.date || badgeData.created,
          flight_id: currentSeasonAchievement.flight_id || badgeData.flight_id,
          season: currentSeason,
          year: 2025,
          verified: true,
          in_current_season: true,
          is_new_level: true,
          previous_season_max_level: previousMaxLevel + 1,
          current_season_max_level: currentSeasonMaxLevel + 1,
          new_points_this_season: newPointsThisSeason,
          previous_total_points: previousTotalPoints,
          achievement_details: {
            actual_value: currentSeasonMaxValue,
            previous_season_level: previousMaxLevel + 1,
            current_season_level: currentSeasonMaxLevel + 1,
            improvement: previousMaxLevel >= 0 ? 
              `Verbesserung von Level ${previousMaxLevel + 1} auf ${currentSeasonMaxLevel + 1} (+${newPointsThisSeason} Punkte)` : 
              `Neu in Saison 24/25: Level ${currentSeasonMaxLevel + 1} (${newPointsThisSeason} Punkte)`
          }
        };
        
        expandedBadges.push(levelBadge);
      }
      
      if (DEBUG_MODE) {
        console.log(`    ✅ NEUER Level ${i + 1} = ${levelPoints} Punkte für Saison 24/25`);
      }
    }
    
    console.log(`    📊 Zusammenfassung: ${newPointsThisSeason} neue Punkte in Saison 24/25 (${previousTotalPoints} Punkte aus Vorsaisons)`);
    
  } else if (currentSeasonMaxLevel >= 0 && previousMaxLevel < 0) {
    // Erster Badge dieser Art in aktueller Saison
    let totalPointsEarned = 0;
    
    // Alle Level bis zum aktuellen zählen
    for (let i = 0; i <= currentSeasonMaxLevel; i++) {
      const levelPoints = points[i] || 1;
      totalPointsEarned += levelPoints;
      
      // Erstelle Badge-Einträge entsprechend der Punkte
      for (let pointIndex = 0; pointIndex < levelPoints; pointIndex++) {
        const levelBadge = {
          ...badgeData,
          id: `${badgeData.id}_L${i + 1}_P${pointIndex + 1}_S2425_NEW`,
          level: i + 1,
          level_value: values[i],
          level_points: levelPoints,
          points: 1, // Jeder Badge-Eintrag zählt als 1
          is_multi_level: true,
          total_levels: values.length,
          name: `${badgeData.badge.name} Level ${i + 1}${levelPoints > 1 ? ` (${pointIndex + 1}/${levelPoints})` : ''} (${values[i]}${getUnitForBadgeType(badgeData.badge_id)})`,
          original_name: badgeData.badge.name,
          logo: badgeData.badge?.logo || null,
          achieved_at: currentSeasonAchievement.date || badgeData.created,
          flight_id: currentSeasonAchievement.flight_id || badgeData.flight_id,
          season: currentSeason,
          year: 2025,
          verified: true,
          in_current_season: true,
          is_new_level: true,
          new_points_this_season: totalPointsEarned
        };
        
        expandedBadges.push(levelBadge);
      }
    }
    
    if (DEBUG_MODE) {
      console.log(`    ✅ Erster Badge dieser Art - Level 1-${currentSeasonMaxLevel + 1} = ${totalPointsEarned} Punkte`);
    }
    
  } else {
    if (DEBUG_MODE) {
      if (currentSeasonMaxLevel === previousMaxLevel && currentSeasonMaxLevel >= 0) {
        console.log(`    ℹ️ Keine Verbesserung (beide Level ${currentSeasonMaxLevel + 1}) - 0 neue Punkte`);
      } else if (currentSeasonMaxLevel < previousMaxLevel) {
        console.log(`    ⚠️ Rückgang von Level ${previousMaxLevel + 1} auf ${currentSeasonMaxLevel + 1} - 0 neue Punkte`);
      } else if (currentSeasonMaxLevel < 0) {
        console.log(`    ℹ️ Kein Badge dieser Art in Saison 24/25 - 0 neue Punkte`);
      }
    }
  }
  
  return expandedBadges;
}

/**
 * Gibt die Einheit für einen Badge-Typ zurück
 */
function getUnitForBadgeType(badgeId) {
  if (!badgeId) return '';
  
  const id = badgeId.toLowerCase();
  
  if (id.includes('astronaut') || id.includes('altitude') || id.includes('height')) return 'm';
  if (id.includes('distance') || id.includes('triangle') || id.includes('km')) return 'km';
  if (id.includes('duration') || id.includes('hour')) return 'h';  // Änderung hier
  if (id.includes('speed')) return 'km/h';
  if (id.includes('points') || id.includes('score')) return 'pt';
  
  return '';
}

/**
 * Hauptfunktion zum Laden der Badges mit Saison-Verifikation
 */
export async function loadPilotBadgesWithYearVerification(userId, year = CURRENT_YEAR) {
  console.log(`🏅 Lade Badges für Pilot ${userId} (Saison 2024/2025)...`);
  
  try {
    // 1. Lade alle Achievements/Badges des Piloten
    const achievementsData = await apiClient.fetchUserAchievements(userId);
    
    if (!achievementsData) {
      console.warn(`⚠️ Keine Badge-Daten für Pilot ${userId} erhalten`);
      return createEmptyBadgeResult();
    }
    
    // Debug: Zeige rohe Daten
    if (DEBUG_MODE) {
      console.log(`📦 Rohe Achievement-Daten für Pilot ${userId}:`, achievementsData);
      console.log(`  → Datenstruktur:`, {
        isArray: Array.isArray(achievementsData),
        hasAchievements: !!achievementsData?.achievements,
        hasData: !!achievementsData?.data,
        keys: Object.keys(achievementsData || {})
      });
    }
    
    // Normalisiere die Badge-Daten
    let allBadges = [];
    if (Array.isArray(achievementsData)) {
      allBadges = achievementsData;
    } else if (achievementsData.achievements && Array.isArray(achievementsData.achievements)) {
      allBadges = achievementsData.achievements;
    } else if (achievementsData.data && Array.isArray(achievementsData.data)) {
      allBadges = achievementsData.data;
    } else {
      console.warn(`⚠️ Unbekannte Badge-Datenstruktur für Pilot ${userId}`);
      return createEmptyBadgeResult();
    }
    
    console.log(`  → ${allBadges.length} Badge-Einträge gefunden`);
    
    // 2. Verarbeite Badges für aktuelle Saison
    const currentSeasonBadges = [];
    const allTimeBadges = [];
    const seasonsCovered = new Set();
    
    // Analysiere Badge-Verteilung
    let badgesBeforeSeason = 0;
    let badgesInSeason = 0;
    
    for (let index = 0; index < allBadges.length; index++) {
      const badgeData = allBadges[index];
      
      if (!badgeData || !badgeData.badge_id) {
        if (DEBUG_MODE) console.log('  ⚠️ Badge ohne badge_id übersprungen:', badgeData);
        continue;
      }
      
      try {
        // Bestimme das Badge-Datum
        let badgeDate = null;
        let badgeYear = null;
        let isVerified = false;
        
        // Versuche Datum aus verschiedenen Quellen zu ermitteln
        if (badgeData.flight_id) {
          // Versuche Flight-Details zu laden für genaues Datum
          const flightDetails = await getCachedFlightDetails(badgeData.flight_id);
          if (flightDetails) {
            badgeDate = flightDetails.scoring_date || 
                       flightDetails.landing_time || 
                       flightDetails.takeoff_time;
            isVerified = true;
          }
        }
        
        // Fallback auf created-Datum
        if (!badgeDate && badgeData.created) {
          badgeDate = badgeData.created;
        }
        
        // Prüfe ob Badge in aktueller Saison liegt
        const inCurrentSeason = isInCurrentSeason(badgeDate);
        const season = getSeasonForDate(badgeDate);
        
        if (badgeDate) {
          badgeYear = new Date(badgeDate).getFullYear();
          seasonsCovered.add(season);
        }
        
        if (DEBUG_MODE && index < 5) { // Zeige erste 5 Badges
          console.log(`  Badge ${badgeData.badge_id}:`);
          console.log(`    Datum: ${badgeDate}`);
          console.log(`    Saison: ${season}`);
          console.log(`    In aktueller Saison: ${inCurrentSeason ? '✅' : '❌'}`);
        }
        
        if (inCurrentSeason) {
          badgesInSeason++;
        } else {
          badgesBeforeSeason++;
        }
        
        // Verarbeite Badge je nach Typ
        if (isMultiLevelBadge(badgeData)) {
          // Multi-Level Badge Verarbeitung
          const processedBadges = await processMultiLevelBadgeWithSeasonHistory(
            badgeData, 
            SEASON_START_DATE, 
            userId
          );
          
          // Füge verarbeitete Badges hinzu
          processedBadges.forEach(pb => {
            if (pb.in_current_season) {
              currentSeasonBadges.push(pb);
            }
            allTimeBadges.push(pb);
          });
          
        } else {
          // Single-Level Badge
          const processedBadge = {
            ...badgeData,
            id: badgeData.id,
            badge_id: badgeData.badge_id,
            flight_id: badgeData.flight_id,
            name: badgeData.badge?.name || badgeData.name || 'Unbekanntes Badge',
            description: badgeData.badge?.description?.de || badgeData.badge?.description?.en || '',
            logo: badgeData.badge?.logo || badgeData.logo || null,
            points: badgeData.points || 0,
            value: badgeData.value || null,
            is_multi_level: false,
            achieved_at: badgeDate,
            year: badgeYear,
            season: season,
            verified: isVerified,
            in_current_season: inCurrentSeason
          };
          
          if (inCurrentSeason) {
            currentSeasonBadges.push(processedBadge);
          }
          allTimeBadges.push(processedBadge);
        }
        
      } catch (error) {
        console.error(`Fehler bei Badge ${badgeData.badge_id}:`, error);
        continue;
      }
    }
    
    // 3. Sortiere und finalisiere
    currentSeasonBadges.sort((a, b) => {
      if (a.badge_id !== b.badge_id) {
        return a.badge_id.localeCompare(b.badge_id);
      }
      return (a.level || 0) - (b.level || 0);
    });
    
    const verifiedBadges = currentSeasonBadges.filter(b => b.verified);
    const uniqueCategories = new Set(currentSeasonBadges.map(b => b.badge_id));
    
    // 4. Detailliertes Logging
    console.log(`  ✅ Badge-Zusammenfassung für Pilot ${userId}:`);
    console.log(`    → ${badgesInSeason} Badges in Saison 2024/2025 (ab Oktober 2024)`);
    console.log(`    → ${badgesBeforeSeason} Badges vor der Saison`);
    console.log(`    → ${currentSeasonBadges.length} Badges verarbeitet für aktuelle Saison`);
    console.log(`    → ${uniqueCategories.size} verschiedene Badge-Kategorien`);
    console.log(`    → ${verifiedBadges.length} über Flugdetails verifiziert`);
    console.log(`    → Saisons abgedeckt: ${Array.from(seasonsCovered).sort().join(', ')}`);
    
    const multiLevelCount = currentSeasonBadges.filter(b => b.is_multi_level).length;
    const singleLevelCount = currentSeasonBadges.filter(b => !b.is_multi_level).length;
    console.log(`    → ${multiLevelCount} Multi-Level Badges, ${singleLevelCount} Single-Level Badges`);
    
    return {
      currentYearBadges: currentSeasonBadges, // Saison 2024/2025
      allTimeBadges: allTimeBadges,
      badgeCount: currentSeasonBadges.length,
      allTimeBadgeCount: allTimeBadges.length,
      verifiedCount: verifiedBadges.length,
      categoryCount: uniqueCategories.size,
      seasonsCovered: Array.from(seasonsCovered).sort()
    };
    
  } catch (error) {
    console.error(`❌ Fehler beim Laden der Badges für Pilot ${userId}:`, error);
    return createEmptyBadgeResult();
  }
}

/**
 * Erstellt ein leeres Badge-Ergebnis
 */
function createEmptyBadgeResult() {
  return {
    currentYearBadges: [],
    allTimeBadges: [],
    badgeCount: 0,
    allTimeBadgeCount: 0,
    verifiedCount: 0,
    categoryCount: 0,
    seasonsCovered: []
  };
}

/**
 * Lädt Badges für alle Piloten
 */
export async function loadAllPilotBadgesWithVerification(pilots, year = CURRENT_YEAR) {
  console.log(`🏅 Lade Badges für ${pilots.length} Piloten (Saison 2024/2025)...`);
  
  const startTime = Date.now();
  const batchSize = 2; // Reduziert wegen mehr API-Calls pro Pilot
  const results = [];
  
  for (let i = 0; i < pilots.length; i += batchSize) {
    const batch = pilots.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (pilot) => {
        const badgeData = await loadPilotBadgesWithYearVerification(pilot.userId, year);
        
        return {
          ...pilot,
          badges: badgeData.currentYearBadges,
          allTimeBadges: badgeData.allTimeBadges,
          badgeCount: badgeData.badgeCount,
          allTimeBadgeCount: badgeData.allTimeBadgeCount,
          verifiedBadgeCount: badgeData.verifiedCount,
          badgeCategoryCount: badgeData.categoryCount,
          seasonsCovered: badgeData.seasonsCovered
        };
      })
    );
    
    results.push(...batchResults);
    
    // Progress update
    console.log(`    Fortschritt: ${Math.min(i + batchSize, pilots.length)}/${pilots.length} Piloten`);
    
    if (i + batchSize < pilots.length) {
      await new Promise(resolve => setTimeout(resolve, 300)); // Pause zwischen Batches
    }
  }
  
  const duration = Date.now() - startTime;
  console.log(`✅ Badge-Laden abgeschlossen in ${(duration/1000).toFixed(1)}s`);
  
  // Zusammenfassung
  const pilotsWithBadges = results.filter(p => p.badgeCount > 0);
  console.log(`📊 Ergebnis: ${pilotsWithBadges.length} von ${pilots.length} Piloten haben Badges in Saison 24/25`);
  
  return results;
}

/**
 * Cache leeren
 */
export function clearBadgeCache() {
  flightDetailsCache.clear();
  console.log('Badge-Cache geleert');
}