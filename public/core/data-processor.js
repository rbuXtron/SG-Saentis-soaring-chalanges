// /public/js/core/data-processor.js
/**
 * SG Säntis Cup - Datenverarbeitungsmodul
 * Version 4.0 - Mit verbesserter Sprint-Integration
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
 * Version 4.0 - Mit verbesserter Sprint-Integration
 */
export async function fetchAllWeGlideData() {
  try {
    console.log('====================================');
    console.log('🚀 Starte optimiertes Daten-Loading v4.0');
    console.log('====================================');

    // 1. Club-Daten abrufen
    console.log('\n📋 Schritt 1: Lade Club-Metadaten...');
    const clubData = await apiClient.fetchClubData();

    // 2. ALLE Club-Flüge laden
    console.log('\n✈️ Schritt 2: Lade ALLE Club-Flüge mit Historie...');
    const startTime = Date.now();

    const requiredStartDate = '2023-06-01';
    const clubFlightsResponse = await apiClient.fetchAllClubFlights(requiredStartDate);

    if (!clubFlightsResponse || !clubFlightsResponse.flights) {
      console.error('❌ Keine Club-Flüge erhalten');
      return [];
    }

    const allClubFlights = clubFlightsResponse.flights;
    const members = clubFlightsResponse.members || clubData.user;
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ ${allClubFlights.length} Flüge in ${loadTime}s geladen`);

    // Validiere Zeitbereich
    validateDateRange(clubFlightsResponse.metadata, requiredStartDate);

    // 3. Flüge nach User gruppieren
    console.log('\n🔧 Schritt 3: Verarbeite Flugdaten...');
    const flightsByUser = groupFlightsByUser(allClubFlights);
    console.log(`📊 Flüge nach User gruppiert: ${flightsByUser.size} Piloten`);

    // 4. Sprint-Daten für alle Mitglieder laden
    console.log('\n🏃 Schritt 4: Lade Sprint-Daten...');
    const currentYear = new Date().getFullYear();
    const allSprintData = await loadAllSprintData(members, currentYear);
    console.log(`✅ ${allSprintData.length} Sprint-Einträge geladen`);

    // Sprint-Daten nach User gruppieren
    const sprintsByUser = groupSprintsByUser(allSprintData);

    // 5. Verarbeite jeden Piloten
    console.log('\n👥 Schritt 5: Verarbeite Piloten-Daten...');
    const processedMembers = await processMembersInBatches(
      members, 
      flightsByUser, 
      sprintsByUser,
      currentYear
    );

    // 6. Statistiken berechnen
    console.log('\n📊 Schritt 6: Berechne Gesamt-Statistiken...');
    const stats = calculateClubStatistics(processedMembers);
    const sprintStats = sprintDataService.generateSprintStatistics(allSprintData);

    console.log('\n✅ Datenverarbeitung abgeschlossen!');
    console.log('====================================');
    console.log(`Zusammenfassung:`);
    console.log(`  • ${processedMembers.length} Piloten verarbeitet`);
    console.log(`  • ${stats.totalFlights} Flüge in ${currentYear}`);
    console.log(`  • ${stats.totalKm.toFixed(0)} km Gesamtstrecke`);
    console.log(`  • ${stats.longestFlight.toFixed(0)} km längster Flug (${stats.longestFlightPilot})`);
    console.log(`  • ${sprintStats.totalSprints} Sprint-Wertungen`);
    console.log(`  • ${sprintStats.maxSpeed.toFixed(1)} km/h Höchstgeschwindigkeit (${sprintStats.topSpeedPilot})`);
    console.log('====================================\n');

    // Erweiterte Rückgabe mit Sprint-Statistiken
    return {
      pilots: processedMembers,
      stats: stats,
      sprintStats: sprintStats
    };

  } catch (error) {
    console.error('❌ Kritischer Fehler beim Abrufen der WeGlide-Daten:', error);
    return {
      pilots: [],
      stats: {},
      sprintStats: {}
    };
  }
}

/**
 * Validiert den Datumsbereich der geladenen Flüge
 */
function validateDateRange(metadata, requiredStartDate) {
  if (!metadata || !metadata.dateRange) return;

  const range = metadata.dateRange;
  console.log(`📅 Zeitbereich: ${range.from} bis ${range.to}`);
  
  if (range.oldestFlight) {
    console.log(`  → Ältester Flug: ${new Date(range.oldestFlight).toLocaleDateString()}`);
  }
  if (range.newestFlight) {
    console.log(`  → Neuester Flug: ${new Date(range.newestFlight).toLocaleDateString()}`);
  }

  const oldestDate = new Date(range.oldestFlight || range.from);
  const requiredDate = new Date(requiredStartDate);
  
  if (oldestDate > requiredDate) {
    console.warn(`⚠️ WARNUNG: Flüge reichen nur bis ${oldestDate.toLocaleDateString()}, benötigt wird ${requiredDate.toLocaleDateString()}`);
  }
}

/**
 * Gruppiert Flüge nach User ID
 */
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

/**
 * Gruppiert Sprint-Daten nach User ID
 */
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

/**
 * Lädt Sprint-Daten für alle Mitglieder
 */
async function loadAllSprintData(members, year) {
  try {
    // Verwende den Sprint-Service für optimiertes Loading
    const sprints = await sprintDataService.loadAllMembersSprints(members, year);
    
    // Zusätzlich: Lade historische Sprint-Daten für Vergleiche
    const previousYear = year - 1;
    const historicalSprints = await sprintDataService.loadAllMembersSprints(members, previousYear);
    
    // Kombiniere aktuelle und historische Daten
    return [...sprints, ...historicalSprints];
  } catch (error) {
    console.error('❌ Fehler beim Laden der Sprint-Daten:', error);
    // Fallback: Extrahiere aus Flügen
    return [];
  }
}

/**
 * Verarbeitet Mitglieder in Batches
 */
async function processMembersInBatches(members, flightsByUser, sprintsByUser, currentYear) {
  const processedMembers = [];
  const batchSize = 5;

  for (let i = 0; i < members.length; i += batchSize) {
    const batch = members.slice(i, i + batchSize);

    const batchPromises = batch.map(async (member) => {
      try {
        return await processSingleMember(
          member, 
          flightsByUser.get(member.id) || [], 
          sprintsByUser.get(member.id) || [],
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
 * Verarbeitet einen einzelnen Piloten
 */
async function processSingleMember(member, userFlights, userSprints, currentYear) {
  const userId = member.id;

  // Filtere eigene Flüge (nicht als Co-Pilot)
  const ownFlights = userFlights.filter(flight => !checkIfPilotIsCoPilot(flight, userId));
  
  console.log(`  ${member.name}: ${ownFlights.length} eigene Flüge, ${userSprints.length} Sprints`);

  // Sortiere Flüge nach Jahr
  const currentYearFlights = ownFlights.filter(f =>
    new Date(f.scoring_date || f.takeoff_time).getFullYear() === currentYear
  );

  // Badge-Berechnung
  const badgeAnalysis = await calculateBadges(userId, member.name, ownFlights, currentYearFlights);

  // Sprint-Daten verarbeiten
  const processedSprints = processSprintData(userSprints, currentYear);

  // Mitglied-Daten zusammenstellen
  return await processMemberDataOptimized(
    member,
    currentYear,
    currentYearFlights,
    ownFlights.filter(f => new Date(f.scoring_date || f.takeoff_time).getFullYear() === currentYear - 1),
    ownFlights.filter(f => new Date(f.scoring_date || f.takeoff_time).getFullYear() < currentYear),
    ownFlights,
    processedSprints,
    badgeAnalysis
  );
}

/**
 * Berechnet Badges für einen Piloten
 */
async function calculateBadges(userId, userName, allFlights, currentYearFlights) {
  try {
    return await calculateUserSeasonBadgesOptimized(
      userId,
      userName,
      allFlights,
      currentYearFlights
    );
  } catch (error) {
    console.warn(`⚠️ Optimierte Badge-Berechnung fehlgeschlagen für ${userName}, verwende Fallback:`, error.message);
    const { calculateUserSeasonBadgesWithConfig } = await import('../services/multi-level-badge-evaluator.js');
    return await calculateUserSeasonBadgesWithConfig(
      userId,
      userName,
      allFlights,
      currentYearFlights
    );
  }
}

/**
 * Verarbeitet Sprint-Daten für einen Piloten
 */
function processSprintData(sprints, currentYear) {
  if (!sprints || sprints.length === 0) return [];

  // Filtere nach Jahr und verbessere Datenstruktur
  const currentYearSprints = sprints.filter(sprint => {
    const sprintYear = new Date(sprint.scoring_date || sprint.takeoff_time).getFullYear();
    return sprintYear === currentYear;
  });

  // Sortiere nach verschiedenen Kriterien
  const bySpeed = [...currentYearSprints].sort((a, b) => 
    (b.contest?.speed || 0) - (a.contest?.speed || 0)
  );
  
  const byDistance = [...currentYearSprints].sort((a, b) => 
    (b.contest?.distance || 0) - (a.contest?.distance || 0)
  );

  // Berechne Sprint-Statistiken für den Piloten
  const stats = {
    totalSprints: currentYearSprints.length,
    bestSpeed: bySpeed[0]?.contest?.speed || 0,
    bestDistance: byDistance[0]?.contest?.distance || 0,
    averageSpeed: currentYearSprints.reduce((sum, s) => sum + (s.contest?.speed || 0), 0) / currentYearSprints.length || 0,
    totalPoints: currentYearSprints.reduce((sum, s) => sum + (s.sgPoints || 0), 0)
  };

  return {
    all: currentYearSprints,
    bySpeed: bySpeed.slice(0, 5), // Top 5 nach Geschwindigkeit
    byDistance: byDistance.slice(0, 5), // Top 5 nach Distanz
    stats: stats
  };
}

/**
 * Optimierte Mitglieder-Verarbeitung (erweitert um Sprint-Daten)
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
  // Bestehende Flugdaten-Verarbeitung
  const rankingFlights = currentYearFlights
    .filter(flight => countsForScoring(flight, false))
    .map(flight => processFlightData(flight));

  const currentYearFlightsProcessed = currentYearFlights
    .map(flight => processFlightData(flight));

  const historicalFlightsProcessed = historicalFlights
    .map(flight => processFlightData(flight));

  // Pilotenfaktor-Berechnung
  let bestHistoricalDistance = 0;
  historicalFlightsProcessed.forEach(flight => {
    if (flight.km > bestHistoricalDistance) {
      bestHistoricalDistance = flight.km;
    }
  });
  const bestHistoricalFactor = calculatePilotFactor(bestHistoricalDistance);

  // Punkte-Berechnung
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

  // Rückgabe mit erweiterten Sprint-Daten
  return {
    name: member.name,
    userId: member.id,
    totalPoints: totalPoints,
    flights: bestFlights,
    allFlights: currentYearFlightsProcessed,
    rankingFlights: rankingFlights,
    historicalFlights: historicalFlightsProcessed,
    
    // NEU: Strukturierte Sprint-Daten
    sprintData: sprintData.all || [],
    sprintStats: sprintData.stats || {},
    topSpeedSprints: sprintData.bySpeed || [],
    topDistanceSprints: sprintData.byDistance || [],
    
    pilotFactor: currentPilotFactor,
    historicalPilotFactor: bestHistoricalFactor,
    
    // Badge-Daten
    badges: Array.isArray(badgeAnalysis.badges) ? badgeAnalysis.badges : [],
    seasonBadges: Array.isArray(badgeAnalysis.seasonBadges) ? badgeAnalysis.seasonBadges : [],
    badgeCount: badgeAnalysis.badgeCount || 0,
    badgeCategoryCount: badgeAnalysis.badgeCategoryCount || 0,
    allTimeBadges: Array.isArray(badgeAnalysis.allTimeBadges) ? badgeAnalysis.allTimeBadges : [],
    allTimeBadgeCount: badgeAnalysis.allTimeBadgeCount || 0,
    priorSeasonCount: badgeAnalysis.priorSeasonCount || 0,
    badgeStats: badgeAnalysis.badgeStats || {},
    flightsWithBadges: badgeAnalysis.flightsWithBadges || 0,
    flightsAnalyzed: badgeAnalysis.flightsAnalyzed || 0,
    multiLevelBadgeCount: badgeAnalysis.multiLevelBadgeCount || 0,
    verifiedBadgeCount: badgeAnalysis.verifiedBadgeCount || 0
  };
}

/**
 * Berechnet Club-weite Statistiken (erweitert um Sprint-Statistiken)
 */
function calculateClubStatistics(members) {
  let totalFlights = 0;
  let totalKm = 0;
  let longestFlight = 0;
  let longestFlightPilot = '';
  let maxWeGlidePoints = 0;
  let maxWeGlidePointsPilot = '';
  let totalSprints = 0;
  let maxSprintSpeed = 0;
  let maxSprintSpeedPilot = '';
  const activePilots = new Set();

  members.forEach(member => {
    if (!member) return;

    // Flug-Statistiken
    if (member.allFlights && member.allFlights.length > 0) {
      activePilots.add(member.name);
      
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
    }

    // Sprint-Statistiken
    if (member.sprintStats) {
      totalSprints += member.sprintStats.totalSprints || 0;
      
      if ((member.sprintStats.bestSpeed || 0) > maxSprintSpeed) {
        maxSprintSpeed = member.sprintStats.bestSpeed;
        maxSprintSpeedPilot = member.name;
      }
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
    totalSprints,
    maxSprintSpeed,
    maxSprintSpeedPilot,
    season: new Date().getFullYear()
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

// Alle weiteren bestehenden Funktionen bleiben unverändert...
export function calculateFlightPointsWithHistory(flights, pilotName, allFlights) {
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