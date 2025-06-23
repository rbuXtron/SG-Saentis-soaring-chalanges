/**
 * SG Säntis Cup - Badge Season Calculator
 * 
 * Berechnet Badges der Saison 2024/2025 durch Subtraktion
 * Alle Badges - Badges bis 30.09.2024 = Saison 24/25 Badges
 * 
 * Version 2.0 - Mit korrekter Behandlung von mehreren Badge-Einträgen
 */

import { apiClient } from './weglide-api-service.js';

const SEASON_START = new Date('2024-10-01'); // 1. Oktober 2024
const SEASON_END = new Date('2025-09-30');   // 30. September 2025

/**
 * Lädt und berechnet Badges für die Saison 2024/2025
 * @param {number} userId - ID des Piloten
 * @param {string} pilotName - Name des Piloten
 * @returns {Promise<Object>} - Badge-Daten für die Saison
 */
export async function calculateSeasonBadges(userId, pilotName) {
  console.log(`🏅 Berechne Saison 24/25 Badges für ${pilotName} (ID: ${userId})`);
  
  try {
    // 1. Lade ALLE Badges des Piloten
    const allBadges = await apiClient.fetchUserAchievements(userId);
    
    if (!allBadges || allBadges.length === 0) {
      console.log(`   → Keine Badges gefunden für ${pilotName}`);
      return createEmptyResult(pilotName, userId);
    }
    
    console.log(`   → ${allBadges.length} Badge-Einträge gesamt gefunden`);
    
    // 2. Gruppiere Badges nach badge_id und sortiere nach Datum
    const badgesByType = new Map();
    const flightIdsWithBadges = new Set(); // NEU: Track Flüge mit Badges
    let totalFlightsAnalyzed = 0; // NEU: Zähle analysierte Flüge
    
    allBadges.forEach(badge => {
      const badgeId = badge.badge_id;
      if (!badgeId) return;
      
      // NEU: Sammle Flug-IDs
      if (badge.flight_id) {
        flightIdsWithBadges.add(badge.flight_id);
      }
      
      if (!badgesByType.has(badgeId)) {
        badgesByType.set(badgeId, []);
      }
      badgesByType.get(badgeId).push(badge);
    });
    
    // NEU: Lade Flugdaten um die Anzahl der analysierten Flüge zu ermitteln
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    
    try {
      const currentYearFlights = await apiClient.fetchUserFlights(userId, currentYear);
      const previousYearFlights = await apiClient.fetchUserFlights(userId, previousYear);
      
      // Zähle nur Flüge seit Saisonbeginn
      const allFlights = [...(currentYearFlights || []), ...(previousYearFlights || [])];
      const seasonFlights = allFlights.filter(flight => {
        const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
        return flightDate >= SEASON_START && flightDate <= SEASON_END;
      });
      
      totalFlightsAnalyzed = seasonFlights.length;
    } catch (error) {
      console.warn(`Konnte Flugdaten für Analyse nicht laden:`, error);
    }
    
    // Sortiere jeden Badge-Typ nach Datum (älteste zuerst)
    badgesByType.forEach((badges, badgeId) => {
      badges.sort((a, b) => {
        const dateA = getBadgeDate(a) || new Date(0);
        const dateB = getBadgeDate(b) || new Date(0);
        return dateA - dateB;
      });
    });
    
    console.log(`   → ${badgesByType.size} verschiedene Badge-Typen gefunden`);
    console.log(`   → ${flightIdsWithBadges.size} Flüge mit Badges`);
    console.log(`   → ${totalFlightsAnalyzed} Flüge analysiert`);
    
    // 3. Analysiere jeden Badge-Typ
    const seasonBadges = [];
    const badgesBeforeSeason = new Map(); // badge_id -> Array von Badges vor Saison
    const seasonFlightIds = new Set(); // NEU: Track Saison-Flüge mit Badges
    
    badgesByType.forEach((badges, badgeId) => {
      const beforeSeason = [];
      const duringSeason = [];
      
      badges.forEach(badge => {
        const badgeDate = getBadgeDate(badge);
        if (!badgeDate) return;
        
        if (badgeDate < SEASON_START) {
          beforeSeason.push(badge);
        } else if (badgeDate <= SEASON_END) {
          duringSeason.push(badge);
          // NEU: Sammle Saison-Flug-IDs
          if (badge.flight_id) {
            seasonFlightIds.add(badge.flight_id);
          }
        }
      });
      
      if (beforeSeason.length > 0) {
        badgesBeforeSeason.set(badgeId, beforeSeason);
      }
      
      // Analysiere neue Badges in der Saison
      if (duringSeason.length > 0) {
        const badgeInfo = badges[0].badge || {};
        const isMultiLevel = Array.isArray(badgeInfo.points) && badgeInfo.points.length > 0;
        
        console.log(`\n   Badge-Typ: ${badgeInfo.name || badgeId}`);
        console.log(`     → ${beforeSeason.length} Einträge vor Saison 24/25`);
        console.log(`     → ${duringSeason.length} Einträge in Saison 24/25`);
        if (isMultiLevel) {
          console.log(`     → Multi-Level Badge mit ${badgeInfo.points.length} Levels`);
        }
        
        // Alle Badges aus der Saison sind neu zu zählen
        duringSeason.forEach((badge, index) => {
          const isFirstEver = beforeSeason.length === 0 && index === 0;
          const badgeValue = badge.value || badge.level || 0;
          const badgePoints = badge.points || 1;
          
          // Bei Multi-Level Badges: Erstelle einen Eintrag pro Punkt
          if (isMultiLevel && badgePoints > 1) {
            console.log(`     → Badge mit ${badgePoints} Punkten wird ${badgePoints}x gezählt`);
            
            for (let pointIndex = 0; pointIndex < badgePoints; pointIndex++) {
              const seasonBadge = {
                ...badge,
                // ID eindeutig machen
                id: `${badge.id}_point_${pointIndex + 1}`,
                // Füge fehlende Felder für UI-Kompatibilität hinzu
                flight_distance: 0,
                aircraft: 'N/A',
                takeoff_airport: 'N/A',
                landing_airport: 'N/A',
                verified: true,
                season: '2024/2025',
                // Stelle sicher, dass Badge-Info korrekt übertragen wird
                logo: badge.logo || (badge.badge && badge.badge.logo) || null,
                name: badge.name || (badge.badge && badge.badge.name) || badge.badge_id,
                description: badge.description || (badge.badge && badge.badge.description) || '',
                // Multi-Level spezifische Infos
                is_multi_level: true,
                is_multi_point: true,
                point_index: pointIndex + 1,
                total_points: badgePoints,
                display_name: `${badge.name || (badge.badge && badge.badge.name) || badge.badge_id} (${pointIndex + 1}/${badgePoints})`,
                // Zusätzliche Saison-Infos
                is_new_in_season: isFirstEver,
                season_occurrence: index + 1,
                total_before_season: beforeSeason.length,
                total_in_season: duringSeason.length
              };
              
              seasonBadges.push(seasonBadge);
            }
          } else {
            // Normaler Badge (1 Punkt)
            const seasonBadge = {
              ...badge,
              // Füge fehlende Felder für UI-Kompatibilität hinzu
              flight_distance: 0,
              aircraft: 'N/A',
              takeoff_airport: 'N/A',
              landing_airport: 'N/A',
              verified: true,
              season: '2024/2025',
              // Stelle sicher, dass Badge-Info korrekt übertragen wird
              logo: badge.logo || (badge.badge && badge.badge.logo) || null,
              name: badge.name || (badge.badge && badge.badge.name) || badge.badge_id,
              description: badge.description || (badge.badge && badge.badge.description) || '',
              // Badge-Infos
              is_multi_level: false,
              is_multi_point: false,
              point_index: 1,
              total_points: 1,
              // Zusätzliche Saison-Infos
              is_new_in_season: isFirstEver,
              season_occurrence: index + 1,
              total_before_season: beforeSeason.length,
              total_in_season: duringSeason.length
            };
            
            seasonBadges.push(seasonBadge);
          }
          
          if (isFirstEver) {
            console.log(`     ✅ ERSTMALIG erreicht!`);
          } else {
            console.log(`     ✅ Badge ${index + 1} von ${duringSeason.length} in dieser Saison`);
          }
        });
      }
    });
    
    // 4. Berechne Statistiken
    const stats = calculateBadgeStats(seasonBadges, allBadges, badgesBeforeSeason, badgesByType);
    
    // 5. Badge-Kategorien zählen (unterschiedliche badge_id in der Saison)
    const uniqueSeasonBadgeTypes = new Set();
    seasonBadges.forEach(badge => uniqueSeasonBadgeTypes.add(badge.badge_id));
    
    console.log(`\n📊 Zusammenfassung für ${pilotName}:`);
    console.log(`   → ${allBadges.length} Badge-Einträge gesamt (all-time)`);
    console.log(`   → ${badgesBeforeSeason.size} Badge-Typen vor Saison 24/25`);
    console.log(`   → ${seasonBadges.length} Badge-Einträge in Saison 24/25`);
    console.log(`   → ${uniqueSeasonBadgeTypes.size} verschiedene Badge-Typen in Saison 24/25`);
    console.log(`   → ${stats.firstTimeTypes} erstmalig erreichte Badge-Typen`);
    console.log(`   → ${seasonFlightIds.size} Flüge mit Badges in Saison 24/25`);
    console.log(`   → ${totalFlightsAnalyzed} Flüge insgesamt analysiert`);
    
    return {
      pilotName,
      userId,
      seasonBadges,
      allTimeBadges: allBadges,
      badgesBeforeSeason: Array.from(badgesBeforeSeason.entries()).map(([id, badges]) => ({
        badge_id: id,
        count: badges.length,
        badges: badges
      })),
      stats,
      // Wichtige Zählungen
      seasonBadgeCount: seasonBadges.length,              // Anzahl Badge-Einträge in Saison
      seasonBadgeTypeCount: uniqueSeasonBadgeTypes.size,  // Anzahl verschiedener Badge-Typen
      allTimeBadgeCount: allBadges.length,
      priorSeasonCount: Array.from(badgesBeforeSeason.values()).reduce((sum, badges) => sum + badges.length, 0),
      // NEU: Flug-Statistiken
      flightsWithBadges: seasonFlightIds.size,            // Anzahl Flüge mit Badges
      flightsAnalyzed: totalFlightsAnalyzed                // Anzahl analysierte Flüge
    };
    
  } catch (error) {
    console.error(`❌ Fehler bei Badge-Berechnung für ${pilotName}:`, error);
    return createEmptyResult(pilotName, userId);
  }
}

/**
 * Ermittelt das Datum eines Badges
 */
function getBadgeDate(badge) {
  // Verschiedene mögliche Datumsfelder
  const dateString = badge.achieved_at || 
                    badge.created || 
                    badge.date || 
                    badge.flight_date;
  
  if (!dateString) return null;
  
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Berechnet detaillierte Statistiken
 */
function calculateBadgeStats(seasonBadges, allBadges, badgesBeforeSeason, badgesByType) {
  const stats = {
    firstTimeTypes: 0,
    repeatedTypes: 0,
    totalPoints: 0,
    badgesByMonth: {},
    badgesByType: {},
    multipleOccurrences: [],
    uniqueTypes: new Set(),
    multiLevelBadges: 0,
    multiPointBadges: 0,
    totalExpandedBadges: 0
  };
  
  // Zähle erweiterte Multi-Point Badges
  seasonBadges.forEach(badge => {
    if (badge.is_multi_point && badge.point_index === 1) {
      stats.multiPointBadges++;
      stats.totalExpandedBadges += badge.total_points - 1; // Zusätzliche Badges durch Punkte
    }
  });
  
  // Analysiere Badge-Typen
  badgesByType.forEach((badges, badgeId) => {
    const beforeCount = badgesBeforeSeason.get(badgeId)?.length || 0;
    const seasonBadgesOfType = seasonBadges.filter(b => b.badge_id === badgeId && !b.is_multi_point);
    const multiPointBadgesOfType = seasonBadges.filter(b => b.badge_id === badgeId && b.is_multi_point && b.point_index === 1);
    
    if (seasonBadgesOfType.length > 0 || multiPointBadgesOfType.length > 0) {
      stats.uniqueTypes.add(badgeId);
      
      if (beforeCount === 0) {
        stats.firstTimeTypes++;
      } else {
        stats.repeatedTypes++;
      }
      
      // Badges mit mehreren Einträgen in der Saison (ohne Multi-Point Duplikate)
      const realOccurrences = seasonBadgesOfType.length + multiPointBadgesOfType.length;
      if (realOccurrences > 1) {
        stats.multipleOccurrences.push({
          badge_id: badgeId,
          name: (seasonBadgesOfType[0] || multiPointBadgesOfType[0]).name || badgeId,
          count: realOccurrences,
          dates: [...seasonBadgesOfType, ...multiPointBadgesOfType].map(b => getBadgeDate(b))
        });
      }
    }
  });
  
  // Weitere Statistiken
  seasonBadges.forEach(badge => {
    // Punkte (nicht doppelt zählen bei Multi-Point)
    if (!badge.is_multi_point || badge.point_index === 1) {
      stats.totalPoints += badge.points || 1;
    }
    
    // Nach Monat (alle Badges zählen)
    const date = getBadgeDate(badge);
    if (date) {
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      stats.badgesByMonth[monthKey] = (stats.badgesByMonth[monthKey] || 0) + 1;
    }
    
    // Nach Typ (alle Badges zählen)
    const type = getBadgeType(badge.badge_id);
    stats.badgesByType[type] = (stats.badgesByType[type] || 0) + 1;
  });
  
  // Sortiere Badges mit mehreren Einträgen
  stats.multipleOccurrences.sort((a, b) => b.count - a.count);
  
  return stats;
}

/**
 * Lädt Badges für alle Piloten mit Saison-Berechnung
 */
export async function calculateAllPilotsSeasonBadges(pilots) {
  console.log(`\n🏅 Starte Saison-Badge-Berechnung für ${pilots.length} Piloten...`);
  const startTime = Date.now();
  
  const results = [];
  const batchSize = 3;
  
  for (let i = 0; i < pilots.length; i += batchSize) {
    const batch = pilots.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(pilot => calculateSeasonBadges(pilot.userId || pilot.id, pilot.name))
    );
    
    results.push(...batchResults);
    
    console.log(`Fortschritt: ${Math.min(i + batchSize, pilots.length)}/${pilots.length} Piloten`);
    
    // Kleine Pause zwischen Batches
    if (i + batchSize < pilots.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  
  // Zusammenfassung
  const totalSeasonBadges = results.reduce((sum, r) => sum + r.seasonBadgeCount, 0);
  const pilotsWithBadges = results.filter(r => r.seasonBadgeCount > 0).length;
  
  console.log(`\n✅ Badge-Berechnung abgeschlossen in ${duration.toFixed(1)}s`);
  console.log(`📊 Gesamt-Zusammenfassung:`);
  console.log(`   → ${totalSeasonBadges} Badge-Einträge in Saison 24/25`);
  console.log(`   → ${pilotsWithBadges} von ${pilots.length} Piloten haben Badges in dieser Saison`);
  
  // Top 5 Piloten nach Badge-Einträgen
  const topPilots = [...results]
    .sort((a, b) => b.seasonBadgeCount - a.seasonBadgeCount)
    .slice(0, 5);
  
  console.log(`\n🏆 Top 5 Piloten (Saison 24/25):`);
  topPilots.forEach((pilot, index) => {
    console.log(`   ${index + 1}. ${pilot.pilotName}: ${pilot.seasonBadgeCount} Badges (${pilot.seasonBadgeTypeCount} Kategorien)`);
  });
  
  return results;
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
    badgesBeforeSeason: [],
    stats: {
      firstTimeTypes: 0,
      repeatedTypes: 0,
      totalPoints: 0,
      badgesByMonth: {},
      badgesByType: {},
      multipleOccurrences: [],
      uniqueTypes: new Set()
    },
    seasonBadgeCount: 0,
    seasonBadgeTypeCount: 0,
    allTimeBadgeCount: 0,
    priorSeasonCount: 0,
    flightsWithBadges: 0,    // NEU
    flightsAnalyzed: 0        // NEU
  };
}

/**
 * Hilfsfunktionen
 */
function getBadgeType(badgeId) {
  if (!badgeId) return 'other';
  const id = badgeId.toLowerCase();
  
  if (id.includes('distance') || id.includes('km')) return 'distance';
  if (id.includes('altitude') || id.includes('height') || id.includes('astronaut')) return 'altitude';
  if (id.includes('duration') || id.includes('hour')) return 'duration';
  if (id.includes('speed')) return 'speed';
  if (id.includes('points')) return 'points';
  if (id.includes('xc') || id.includes('cross')) return 'xc';
  if (id.includes('consistency') || id.includes('regular')) return 'consistency';
  if (id.includes('weekend') || id.includes('weekday')) return 'timing';
  if (id.includes('photo') || id.includes('story')) return 'social';
  
  return 'other';
}

function getUnitForBadgeType(badgeId) {
  if (!badgeId) return '';
  const id = badgeId.toLowerCase();
  
  if (id.includes('altitude') || id.includes('height')) return 'm';
  if (id.includes('distance') || id.includes('km')) return 'km';
  if (id.includes('duration') || id.includes('hour')) return 'h';
  if (id.includes('speed')) return 'km/h';
  if (id.includes('points')) return 'pt';
  
  return '';
}