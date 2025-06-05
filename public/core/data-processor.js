// /public/js/core/data-processor.js
/**
 * SG Säntis Cup - Datenverarbeitungsmodul
 * Version 5.0 - Optimiert: Historische Daten nur für Badge-Berechnung
 */

import { apiClient } from '../services/weglide-api-service.js';
import { calculateUserSeasonBadgesOptimized } from '../services/optimized-badge-evaluator.js';
import { sprintDataService } from '../services/sprint-data-service.js';
import {
  APP_CONFIG,
  PILOT_FACTORS,
  AIRCRAFT_FACTORS,
  FLIGHT_INSTRUCTORS,
  HISTORICAL_PILOT_FACTORS,
  AIRFIELD_FACTORS,
  getAircraftFactor
} from '../config/constants.js';
import { formatISODateTime, formatDateForDisplay } from '../utils/utils.js';
import { checkIfPilotIsCoPilot } from './flight-analyzer.js';

/**
 * Lädt alle Daten der SG Säntis Mitglieder von WeGlide
 * Version 5.0 - Lädt nur aktuelle Saison, außer für Badge-Verifikation
 */
export async function fetchAllWeGlideData() {
  try {
    console.log('====================================');
    console.log('🚀 Starte optimiertes Daten-Loading v5.0');
    console.log('====================================');


    // 1. Club-Daten abrufen
    console.log('\n📋 Schritt 1: Lade Club-Metadaten...');
    const clubData = await apiClient.fetchClubData();




// 2. Aktuelle Saison-Flüge laden für normale Auswertungen
    console.log('\n✈️ Schritt 2: Lade Saison 2025 Flüge...');
    const startTime = Date.now();

    // Lade ALLE Club-Flüge (für historische Daten und aktuelle Saison)
    const clubFlightsResponse = await apiClient.fetchAllClubFlights();

    if (!clubFlightsResponse || !clubFlightsResponse.flights) {
      console.error('❌ Keine Club-Flüge erhalten');
      return { pilots: [], stats: {}, sprintStats: {} };
    }

    // Filtere Flüge nach Zeiträumen
    const currentYear = new Date().getFullYear();
    const allClubFlights = clubFlightsResponse.flights;
    
    // Aktuelle Saison Flüge (2025)
    const season2025Flights = allClubFlights.filter(flight => {
      const flightYear = new Date(flight.scoring_date || flight.takeoff_time).getFullYear();
      return flightYear === currentYear;
    });
    
    // Historische Flüge (vor 2025) für Pilotenfaktor-Berechnung
    const historicalFlights = allClubFlights.filter(flight => {
      const flightYear = new Date(flight.scoring_date || flight.takeoff_time).getFullYear();
      return flightYear < currentYear;
    });

    const members = clubFlightsResponse.members || clubData.user;
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ ${season2025Flights.length} Flüge aus Saison 2025 in ${loadTime}s geladen`);
    console.log(`📜 ${historicalFlights.length} historische Flüge für Pilotenfaktor-Berechnung`);

    // 3. Flüge nach User gruppieren
    console.log('\n🔧 Schritt 3: Verarbeite Flugdaten...');
    const flightsByUser = groupFlightsByUser(season2025Flights);
    const historicalFlightsByUser = groupFlightsByUser(historicalFlights);
    console.log(`📊 ${flightsByUser.size} Piloten mit Flügen in 2025`);



    // 4. Sprint-Daten NUR für 2025
    console.log('\n🏃 Schritt 4: Lade Sprint-Daten 2025...');
    const sprintData2025 = await sprintDataService.loadAllMembersSprints(members, currentYear);
    const sprintsByUser = groupSprintsByUser(sprintData2025);
    console.log(`✅ ${sprintData2025.length} Sprint-Einträge für 2025`);

    // 5. Badge-Historie separat laden (nur wenn benötigt)
    console.log('\n🏅 Schritt 5: Bereite Badge-Historie vor...');
    // Erstelle eine Funktion die bei Bedarf geladen wird
    const loadBadgeHistoryForUser = createBadgeHistoryLoader(clubFlightsResponse.flights);

    // 6. Verarbeite jeden Piloten
    console.log('\n👥 Schritt 6: Verarbeite Piloten-Daten...');
    const processedMembers = await processMembersOptimized(
      members, 
      flightsByUser,
      historicalFlightsByUser, 
      sprintsByUser,
      loadBadgeHistoryForUser,
      currentYear
    );

    // 7. Statistiken berechnen (nur 2025)
    console.log('\n📊 Schritt 7: Berechne Saison 2025 Statistiken...');
    const stats = calculateSeasonStatistics(processedMembers, currentYear);
    const sprintStats = sprintDataService.generateSprintStatistics(sprintData2025, currentYear);

    console.log('\n✅ Datenverarbeitung abgeschlossen!');
    console.log('====================================');
    console.log(`Zusammenfassung Saison ${currentYear}:`);
    console.log(`  • ${processedMembers.length} Piloten aktiv`);
    console.log(`  • ${stats.totalFlights} Flüge`);
    console.log(`  • ${stats.totalKm.toFixed(0)} km Gesamtstrecke`);
    console.log(`  • ${stats.longestFlight.toFixed(0)} km längster Flug (${stats.longestFlightPilot})`);
    console.log(`  • ${sprintStats.totalSprints} Sprint-Wertungen`);
    if (sprintStats.maxSpeed > 0) {
      console.log(`  • ${sprintStats.maxSpeed.toFixed(1)} km/h Höchstgeschwindigkeit (${sprintStats.topSpeedPilot})`);
    }
    console.log('====================================\n');

    return {
      pilots: processedMembers,
      stats: stats,
      sprintStats: sprintStats
    };

  } catch (error) {
    console.error('❌ Kritischer Fehler:', error);
    return { pilots: [], stats: {}, sprintStats: {} };
  }
}

/**
 * Erstellt einen Lazy-Loader für Badge-Historie
 */
function createBadgeHistoryLoader(allClubFlights) {
  // Cache für bereits geladene User-Historien
  const historyCache = new Map();
  
  return async function(userId) {
    if (historyCache.has(userId)) {
      return historyCache.get(userId);
    }

    console.log(`  📜 Lade Badge-Historie für User ${userId}...`);
    
    // Filtere historische Flüge (vor 2025) für diesen User
    const userHistoricalFlights = allClubFlights.filter(flight => {
      if (flight.user?.id !== userId) return false;
      
      const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
      const flightYear = flightDate.getFullYear();
      
      // Nur Flüge von Juni 2023 bis Dezember 2024 für Badge-Historie
      return flightYear >= 2023 && flightYear <= 2024;
    });

    historyCache.set(userId, userHistoricalFlights);
    console.log(`    → ${userHistoricalFlights.length} historische Flüge gefunden`);
    
    return userHistoricalFlights;
  };
}

/**
 * Verarbeitet Mitglieder mit optimiertem Daten-Loading
 */
async function processMembersOptimized(members, flightsByUser, sprintsByUser, loadBadgeHistory, currentYear) {
  const processedMembers = [];
  const batchSize = 5;

  for (let i = 0; i < members.length; i += batchSize) {
    const batch = members.slice(i, i + batchSize);

    const batchPromises = batch.map(async (member) => {
      try {
        const userId = member.id;
        const userFlights2025 = flightsByUser.get(userId) || [];
        const userSprints2025 = sprintsByUser.get(userId) || [];

        // Filtere eigene Flüge (nicht als Co-Pilot)
        const ownFlights2025 = userFlights2025.filter(flight => 
          !checkIfPilotIsCoPilot(flight, userId)
        );

        console.log(`  ${member.name}: ${ownFlights2025.length} Flüge, ${userSprints2025.length} Sprints in 2025`);

        // Badge-Berechnung mit Lazy-Loading der Historie
        let badgeAnalysis;
        if (ownFlights2025.length > 0) {
          // Lade historische Daten NUR für Badge-Berechnung
          //const historicalFlights = await loadBadgeHistory(userId);
          const historicalFlights = await loadBadgeHistoryForUser(userId);
 
          
          badgeAnalysis = await calculateUserSeasonBadgesOptimized(
            userId,
            member.name,
            [...historicalFlights, ...ownFlights2025], // Kombiniere für Badge-Analyse
            ownFlights2025  // Nur 2025 für aktuelle Saison
          );
        } else {
          // Keine Flüge = keine Badges
          badgeAnalysis = createEmptyBadgeResult(userId, member.name);
        }

        // Verarbeite Member-Daten (nur mit 2025 Daten)
        return processMemberData2025(
          member,
          ownFlights2025,
          userSprints2025,
          badgeAnalysis,
          currentYear
        );

      } catch (error) {
        console.error(`❌ Fehler bei ${member.name}:`, error.message);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    processedMembers.push(...batchResults.filter(m => m !== null));

    console.log(`  Fortschritt: ${Math.min(i + batchSize, members.length)}/${members.length} Piloten`);
  }

  return processedMembers;
}

/**
 * Verarbeitet Member-Daten nur mit Saison 2025
 */
/**
 * Verarbeitet Member-Daten mit historischen Daten für Pilotenfaktor
 */
function processMemberData2025(member, flights2025, historicalFlights, sprints2025, badgeAnalysis, currentYear) {
  // Verarbeite alle Flugdaten
  const processedFlights = flights2025.map(flight => processFlightData(flight));
  const processedHistoricalFlights = historicalFlights.map(flight => processFlightData(flight));
  
  // Berechne den aktuellen Pilotenfaktor basierend auf historischen Daten
  const allFlights = [...processedHistoricalFlights, ...processedFlights];
  const bestHistoricalDistance = allFlights.length > 0 ?
    Math.max(...allFlights.map(f => f.km)) : 0;
  const dynamicPilotFactor = calculatePilotFactor(bestHistoricalDistance);
  
  // Berechne Ranking-Flüge (nur 2025)
  const rankingFlights = processedFlights
    .filter(flight => countsForScoring(flight, false));

  // Berechne Punkte mit dem dynamischen Pilotenfaktor
  calculateFlightPointsWithDynamicFactor(rankingFlights, member.name, dynamicPilotFactor);

  // Die besten 3 Flüge
  rankingFlights.sort((a, b) => b.points - a.points);
  const bestFlights = rankingFlights.slice(0, APP_CONFIG.BEST_FLIGHTS_COUNT);
  const totalPoints = bestFlights.reduce((sum, flight) => sum + flight.points, 0);

  // Sprint-Statistiken für 2025
  const sprintStats = calculatePilotSprintStats(sprints2025);

  return {
    name: member.name,
    userId: member.id,
    totalPoints: totalPoints,
    flights: bestFlights,
    allFlights: processedFlights,
    rankingFlights: rankingFlights,
    historicalFlights: processedHistoricalFlights, // Historische Daten verfügbar
    
    // Sprint-Daten 2025
    sprintData: sprints2025,
    sprintStats: sprintStats,
    topSpeedSprints: sprints2025
      .sort((a, b) => (b.contest?.speed || 0) - (a.contest?.speed || 0))
      .slice(0, 5),
    topDistanceSprints: sprints2025
      .sort((a, b) => (b.contest?.distance || 0) - (a.contest?.distance || 0))
      .slice(0, 5),
    
    // Pilotenfaktoren
    pilotFactor: dynamicPilotFactor,
    historicalPilotFactor: HISTORICAL_PILOT_FACTORS[member.name] || HISTORICAL_PILOT_FACTORS.DEFAULT,
    bestHistoricalDistance: bestHistoricalDistance,
    
    // Badge-Daten (mit Historie berechnet, aber nur Season-Badges zählen)
    badges: badgeAnalysis.badges || [],
    seasonBadges: badgeAnalysis.seasonBadges || [],
    badgeCount: badgeAnalysis.badgeCount || 0,
    badgeCategoryCount: badgeAnalysis.badgeCategoryCount || 0,
    allTimeBadges: badgeAnalysis.allTimeBadges || [],
    allTimeBadgeCount: badgeAnalysis.allTimeBadgeCount || 0,
    flightsWithBadges: badgeAnalysis.flightsWithBadges || 0,
    flightsAnalyzed: flights2025.length,
    
    // Jahr-Markierung
    season: currentYear
  };
}

/**
 * Berechnet Flugpunkte mit dynamischem Pilotenfaktor
 */
function calculateFlightPointsWithDynamicFactor(flights, pilotName, dynamicPilotFactor) {
  // Fallback auf historischen Faktor, wenn kein dynamischer verfügbar
  const configHistoricalFactor = HISTORICAL_PILOT_FACTORS[pilotName] || HISTORICAL_PILOT_FACTORS.DEFAULT;
  
  flights.forEach(flight => {
    // Verwende den dynamischen Faktor, oder Fallback auf konfigurierten
    const effectivePilotFactor = dynamicPilotFactor || configHistoricalFactor;
    const aircraftFactor = getAircraftFactor(flight.aircraftType);
    const points = flight.km * effectivePilotFactor * aircraftFactor * flight.takeoffFactor;

    flight.points = points;
    flight.pFactor = effectivePilotFactor;
    flight.pilotFactor = effectivePilotFactor;
    flight.flzFaktor = aircraftFactor;
    flight.aircraftFactor = aircraftFactor;
  });
}

/**
 * Berechnet Saison-Statistiken (nur 2025)
 * ANGEPASST: Sprint-Statistiken entfernt
 */
function calculateSeasonStatistics(members, season) {
  let totalFlights = 0;
  let totalKm = 0;
  let longestFlight = 0;
  let longestFlightPilot = '';
  let maxWeGlidePoints = 0;
  let maxWeGlidePointsPilot = '';
  const activePilots = new Set();

  members.forEach(member => {
    if (!member) return;

    // Nur wenn Flüge in 2025 vorhanden
    if (member.allFlights && member.allFlights.length > 0) {
      activePilots.add(member.name);
      
      member.allFlights.forEach(flight => {
        totalFlights++;
        totalKm += flight.km || 0;

        if ((flight.km || 0) > longestFlight) {
          longestFlight = flight.km || 0;
          longestFlightPilot = member.name;
        }

        if ((flight.originalPoints || 0) > maxWeGlidePoints) {
          maxWeGlidePoints = flight.originalPoints || 0;
          maxWeGlidePointsPilot = member.name;
        }
      });
    }
  });

  return {
    totalPilots: activePilots.size,
    totalFlights,
    totalKm,
    longestFlight,
    longestFlightPilot,
    maxWeGlidePoints,
    maxWeGlidePointsPilot,
    season: season
  };
}

/**
 * Berechnet Sprint-Statistiken für einen Piloten
 */
function calculatePilotSprintStats(sprints) {
  if (!sprints || sprints.length === 0) {
    return {
      totalSprints: 0,
      bestSpeed: 0,
      bestDistance: 0,
      averageSpeed: 0,
      totalPoints: 0
    };
  }

  const speeds = sprints.map(s => s.contest?.speed || 0);
  const distances = sprints.map(s => s.contest?.distance || 0);

  return {
    totalSprints: sprints.length,
    bestSpeed: Math.max(...speeds),
    bestDistance: Math.max(...distances),
    averageSpeed: speeds.reduce((a, b) => a + b, 0) / speeds.length,
    totalPoints: sprints.reduce((sum, s) => sum + (s.sgPoints || 0), 0)
  };
}

// Hilfsfunktionen
function groupFlightsByUser(flights) {
  const flightsByUser = new Map();

  flights.forEach(flight => {
    const userId = flight.user?.id;
    if (!userId) return;

    if (!flightsByUser.has(userId)) {
      flightsByUser.set(userId, []);
    }
    flightsByUser.get(userId).push(flight);
  });

  return flightsByUser;
}

function groupSprintsByUser(sprints) {
  const sprintsByUser = new Map();

  sprints.forEach(sprint => {
    const userId = sprint.pilotId || sprint.user_id;
    if (!userId) return;

    if (!sprintsByUser.has(userId)) {
      sprintsByUser.set(userId, []);
    }
    sprintsByUser.get(userId).push(sprint);
  });

  return sprintsByUser;
}

function createEmptyBadgeResult(userId, userName) {
  return {
    userId,
    userName,
    badges: [],
    seasonBadges: [],
    badgeCount: 0,
    seasonBadgeCount: 0,
    badgeCategoryCount: 0,
    flightsAnalyzed: 0,
    flightsWithBadges: 0
  };
}

// Export der bestehenden Funktionen
export function processFlightData(flight) {
  if (!flight) return null;

  const km = flight.contest?.distance || 0;
  const speed = flight.contest?.speed || 0;
  const originalPoints = flight.contest?.points || 0;
  const aircraftType = flight.aircraft?.name || 'Unbekannt';
  const date = flight.scoring_date || flight.takeoff_time;
  const takeoffAirport = flight.takeoff_airport?.name || 'Unbekannt';
  const coPilotName = getCoPliotName(flight);

  return {
    km: km,
    speed: speed,
    originalPoints: originalPoints,
    aircraftType: aircraftType,
    date: date,
    takeoffAirportName: takeoffAirport,
    takeoffFactor: getAirfieldFactor(takeoffAirport),
    coPilotName: coPilotName,
    flightYear: new Date(date).getFullYear(),
    rawData: flight
  };
}

export function calculatePilotFactor(distance) {
  for (const factor of PILOT_FACTORS) {
    if (distance <= factor.maxKm) {
      return factor.factor;
    }
  }
  return 1.0;
}

function getAirfieldFactor(airfieldName) {
  return AIRFIELD_FACTORS[airfieldName] || AIRFIELD_FACTORS.DEFAULT;
}

export function countsForScoring(flight, includeFlightsWithInstructor = false) {
  if (!flight) return false;
  if (includeFlightsWithInstructor) return true;

  const coPilotName = getCoPliotName(flight);
  if (coPilotName && FLIGHT_INSTRUCTORS.includes(coPilotName)) {
    return false;
  }
  return true;
}

export function getCoPliotName(flight) {
  if (!flight) return null;

  if (flight.co_user) {
    if (typeof flight.co_user === 'object' && flight.co_user.name) {
      return flight.co_user.name;
    } else if (typeof flight.co_user === 'string') {
      return flight.co_user;
    }
  }

  if (flight.co_user_name) {
    return flight.co_user_name;
  }

  return null;
}

// Für Kompatibilität
export function calculateFlightPointsWithHistory(flights, pilotName, allFlights) {
  // Nutze die vereinfachte Version
  calculateFlightPoints2025(flights, pilotName);
}

export { formatISODateTime };