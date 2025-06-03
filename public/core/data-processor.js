// /public/js/core/data-processor.js
/**
/ /public/js/core/data-processor.js
/**
 * SG Säntis Cup - Datenverarbeitungsmodul
 * Version 2.0 - Mit optimiertem Club-Flüge Loading
 */

import { apiClient } from '../services/weglide-api-service.js';
// ÄNDERN: Importiere die enhanced Version
import { calculateSeasonBadgesReverse } from '../services/badge-reverse-calculator-enhanced.js';
// Entferne die alten Imports:
// import { calculateSeasonBadges } from '../services/badge-season-calculator.js';
// import { calculateSeasonBadgesReverse } from '../services/badge-reverse-calculator.js';

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
 * Version 2.0 - Mit optimiertem Loading
 */
export async function fetchAllWeGlideData() {
  try {
    console.log('====================================');
    console.log('🚀 Starte optimiertes Daten-Loading');
    console.log('====================================');

    // 1. Club-Daten abrufen für Mitgliederliste
    console.log('\n📋 Schritt 1: Lade Club-Mitglieder...');
    const clubData = await apiClient.fetchClubData();
    
    if (!clubData || !clubData.user || !Array.isArray(clubData.user)) {
      console.error('❌ Keine gültigen Club-Daten erhalten');
      return [];
    }

    const members = clubData.user;
    console.log(`✅ ${members.length} Mitglieder gefunden`);

    // 2. ALLE Club-Flüge laden (optimiert)
    console.log('\n✈️ Schritt 2: Lade ALLE Club-Flüge seit Juni 2023...');
    const startTime = Date.now();
    
    const clubFlightsResponse = await apiClient.fetchAllClubFlights('2023-06-01');
    
    if (!clubFlightsResponse || !clubFlightsResponse.flights) {
      console.error('❌ Keine Club-Flüge erhalten');
      return [];
    }

    const allClubFlights = clubFlightsResponse.flights;
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`✅ ${allClubFlights.length} Flüge in ${loadTime}s geladen`);
    console.log(`📊 Metadaten:`, clubFlightsResponse.metadata);

    // 3. Flüge nach User gruppieren und Co-Pilot-Filterung
    console.log('\n🔧 Schritt 3: Verarbeite Flugdaten...');
    const flightsByUser = new Map();
    const coPilotStats = {
      total: 0,
      byUser: new Map()
    };

    allClubFlights.forEach(flight => {
      const userId = flight.user?.id;
      if (!userId) return;

      // Co-Pilot Check für alle User
      members.forEach(member => {
        if (member.id !== userId && checkIfPilotIsCoPilot(flight, member.id)) {
          coPilotStats.total++;
          coPilotStats.byUser.set(
            member.id, 
            (coPilotStats.byUser.get(member.id) || 0) + 1
          );
        }
      });

      // Flug dem Haupt-Piloten zuordnen
      if (!flightsByUser.has(userId)) {
        flightsByUser.set(userId, []);
      }
      flightsByUser.get(userId).push(flight);
    });

    console.log(`📊 Co-Pilot-Statistik: ${coPilotStats.total} Flüge mit Co-Piloten`);

    // 4. Verarbeite jeden Piloten
    console.log('\n👥 Schritt 4: Verarbeite Piloten-Daten...');
    const currentYear = new Date().getFullYear();
    const processedMembers = [];

    // Batch-Verarbeitung für Badges
    const batchSize = 5;
    
    for (let i = 0; i < members.length; i += batchSize) {
      const batch = members.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (member) => {
        try {
          const userId = member.id;
          const userFlights = flightsByUser.get(userId) || [];
          
          // Filtere Flüge wo der User NICHT Co-Pilot ist
          const ownFlights = userFlights.filter(flight => 
            !checkIfPilotIsCoPilot(flight, userId)
          );
          
          const coPilotCount = userFlights.length - ownFlights.length;
          if (coPilotCount > 0) {
            console.log(`  ⚠️ ${member.name}: ${coPilotCount} Flüge als Co-Pilot gefiltert`);
          }

          // Flüge nach Jahr sortieren
          const currentYearFlights = ownFlights.filter(f => 
            new Date(f.scoring_date || f.takeoff_time).getFullYear() === currentYear
          );
          const previousYearFlights = ownFlights.filter(f => 
            new Date(f.scoring_date || f.takeoff_time).getFullYear() === currentYear - 1
          );
          const historicalFlights = ownFlights.filter(f => 
            new Date(f.scoring_date || f.takeoff_time).getFullYear() < currentYear
          );

          console.log(`  ${member.name}: ${currentYearFlights.length} Flüge in ${currentYear}, ${previousYearFlights.length} in ${currentYear - 1}`);

          // Sprint-Daten laden (diese müssen separat geladen werden)
          let sprintData = [];
          try {
            sprintData = await apiClient.fetchSprintData(userId);
          } catch (error) {
            console.warn(`    Sprint-Daten für ${member.name} nicht verfügbar`);
          }

          // Badge-Berechnung
          //const badgeAnalysis = await calculateSeasonBadges(userId, member.name);
          // NEU:
          const badgeAnalysis = await calculateSeasonBadgesReverse(userId, member.name);

          // Mitglied verarbeiten
          return await processMemberDataOptimized(
            member,
            currentYear,
            currentYearFlights,
            previousYearFlights,
            historicalFlights,
            ownFlights,
            sprintData,
            badgeAnalysis
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

    // 5. Statistiken berechnen
    console.log('\n📊 Schritt 5: Berechne Gesamt-Statistiken...');
    const stats = calculateClubStatistics(processedMembers);
    
    console.log('\n✅ Datenverarbeitung abgeschlossen!');
    console.log('====================================');
    console.log(`Zusammenfassung:`);
    console.log(`  • ${processedMembers.length} Piloten verarbeitet`);
    console.log(`  • ${stats.totalFlights} Flüge in ${currentYear}`);
    console.log(`  • ${stats.totalKm.toFixed(0)} km Gesamtstrecke`);
    console.log(`  • Längster Flug: ${stats.longestFlight.toFixed(0)} km (${stats.longestFlightPilot})`);
    console.log('====================================\n');

    return processedMembers;

  } catch (error) {
    console.error('❌ Kritischer Fehler beim Abrufen der WeGlide-Daten:', error);
    return [];
  }
}

/**
 * Optimierte Mitglieder-Verarbeitung
 */
async function processMemberDataOptimized(
  member,
  currentYear,
  currentYearFlights,
  previousYearFlights,
  historicalFlights,
  allUserFlights,
  sprintData,
  badgeAnalysis
) {
  // Verarbeite Flugdaten
  const rankingFlights = currentYearFlights
    .filter(flight => countsForScoring(flight, false))
    .map(flight => processFlightData(flight));

  const currentYearFlightsProcessed = currentYearFlights
    .map(flight => processFlightData(flight));

  const historicalFlightsProcessed = historicalFlights
    .map(flight => processFlightData(flight));

  // Berechne Pilotenfaktor
  let bestHistoricalDistance = 0;
  historicalFlightsProcessed.forEach(flight => {
    if (flight.km > bestHistoricalDistance) {
      bestHistoricalDistance = flight.km;
    }
  });
  const bestHistoricalFactor = calculatePilotFactor(bestHistoricalDistance);

  // Berechne Punkte mit Historie
  const allFlightsForProgression = [
    ...historicalFlightsProcessed,
    ...currentYearFlightsProcessed
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  calculateFlightPointsWithHistory(rankingFlights, member.name, allFlightsForProgression);

  // Die besten 3 Flüge auswählen
  rankingFlights.sort((a, b) => b.points - a.points);
  const bestFlights = rankingFlights.slice(0, APP_CONFIG.BEST_FLIGHTS_COUNT);
  const totalPoints = bestFlights.reduce((sum, flight) => sum + flight.points, 0);

  // Aktueller Pilotenfaktor
  const currentBestDistance = rankingFlights.length > 0 ?
    Math.max(...rankingFlights.map(f => f.km)) : 0;
  const currentPilotFactor = calculatePilotFactor(currentBestDistance);

  return {
    name: member.name,
    userId: member.id,
    totalPoints: totalPoints,
    flights: bestFlights,
    allFlights: currentYearFlightsProcessed,
    rankingFlights: rankingFlights,
    historicalFlights: historicalFlightsProcessed,
    sprintData: sprintData,
    pilotFactor: currentPilotFactor,
    historicalPilotFactor: bestHistoricalFactor,
    // Badge-Daten
    badges: badgeAnalysis.seasonBadges,
    badgeCount: badgeAnalysis.seasonBadgeCount,
    badgeCategoryCount: badgeAnalysis.seasonBadgeTypeCount,
    allTimeBadges: badgeAnalysis.allTimeBadges,
    allTimeBadgeCount: badgeAnalysis.allTimeBadgeCount,
    priorSeasonCount: badgeAnalysis.priorSeasonCount,
    badgeStats: badgeAnalysis.stats,
    flightsWithBadges: badgeAnalysis.flightsWithBadges || 0,
    flightsAnalyzed: badgeAnalysis.flightsAnalyzed || 0,
    firstTimeTypes: badgeAnalysis.stats.firstTimeTypes,
    repeatedTypes: badgeAnalysis.stats.repeatedTypes,
    multipleOccurrences: badgeAnalysis.stats.multipleOccurrences
  };
}

/**
 * Berechnet Club-weite Statistiken
 */
function calculateClubStatistics(members) {
  let totalFlights = 0;
  let totalKm = 0;
  let longestFlight = 0;
  let longestFlightPilot = '';
  let maxWeGlidePoints = 0;
  let maxWeGlidePointsPilot = '';
  const activePilots = new Set();

  members.forEach(member => {
    if (!member || !member.allFlights) return;

    if (member.allFlights.length > 0) {
      activePilots.add(member.name);
    }

    member.allFlights.forEach(flight => {
      if (!flight) return;

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
  });

  return {
    totalPilots: activePilots.size,
    totalFlights,
    totalKm,
    longestFlight,
    longestFlightPilot,
    maxWeGlidePoints,
    maxWeGlidePointsPilot,
    season: new Date().getFullYear()
  };
}

// Restliche Funktionen bleiben unverändert...
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

export function calculateFlightPointsWithHistory(flights, pilotName, allFlights) {
  // Implementation bleibt gleich
  const allFlightsWithFactors = calculateProgressivePilotFactors(allFlights);
  
  const flightFactorMap = new Map();
  allFlightsWithFactors.forEach(flight => {
    const key = `${flight.date}_${flight.km}`;
    flightFactorMap.set(key, flight.pilotFactor);
  });

  const configHistoricalFactor = HISTORICAL_PILOT_FACTORS[pilotName] || HISTORICAL_PILOT_FACTORS.DEFAULT;

  flights.forEach(flight => {
    const key = `${flight.date}_${flight.km}`;
    const progressiveFactor = flightFactorMap.get(key) || 4.0;
    const effectivePilotFactor = Math.min(progressiveFactor, configHistoricalFactor);
    const aircraftFactor = getAircraftFactor(flight.aircraftType);
    const points = flight.km * effectivePilotFactor * aircraftFactor * flight.takeoffFactor;

    flight.points = points;
    flight.pFactor = effectivePilotFactor;
    flight.pilotFactor = effectivePilotFactor;
    flight.flzFaktor = aircraftFactor;
    flight.aircraftFactor = aircraftFactor;
  });
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

function calculateProgressivePilotFactors(allFlights) {
  if (!Array.isArray(allFlights) || allFlights.length === 0) return [];

  const sortedFlights = [...allFlights].sort((a, b) => {
    const dateA = new Date(a.date || a.scoring_date || 0);
    const dateB = new Date(b.date || b.scoring_date || 0);
    return dateA - dateB;
  });

  let currentBestDistance = 0;
  let currentPilotFactor = 4.0;

  sortedFlights.forEach((flight, index) => {
    flight.pilotFactor = currentPilotFactor;
    flight.pFactor = currentPilotFactor;

    if (flight.km > currentBestDistance) {
      currentBestDistance = flight.km;
      currentPilotFactor = calculatePilotFactor(currentBestDistance);
    }
  });

  return sortedFlights;
}

export { formatISODateTime };