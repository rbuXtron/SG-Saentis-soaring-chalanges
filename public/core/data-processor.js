// /public/js/core/data-processor.js
/**
 * SG Säntis Cup - Datenverarbeitungsmodul
 * Version 7.0 - Mit Multi-Level Badge Evaluator
 */

import { apiClient } from '../services/weglide-api-service.js';
import { calculateUserSeasonBadgesWithConfig } from '../services/multi-level-badge-evaluator.js';
import { sprintDataService } from '../services/sprint-data-service.js';
import {
  APP_CONFIG,
  PILOT_FACTORS,
  FLIGHT_INSTRUCTORS,
  AIRFIELD_FACTORS,
  getAircraftFactor,
  getInstructorFlightFactor
} from '../config/constants.js';
import { formatDateForDisplay } from '../utils/utils.js';
import { checkIfPilotIsCoPilot } from './flight-analyzer.js';

// =============================================================================
// KONSTANTEN
// =============================================================================

const DEBUG = true;
const BATCH_SIZE = 15;
const RATE_LIMIT_DELAY = 100;

function debug(...args) {
  if (DEBUG) console.log(...args);
}

// =============================================================================
// HAUPTEXPORT - Saison-basiertes Datenladen
// =============================================================================

export async function fetchAllWeGlideDataForSeason(seasonYear = '2026') {
  try {
    const seasonString = seasonYear === '2026' ? '2025/2026' : '2024/2025';

    debug('====================================');
    debug(`🚀 Lade Daten für Saison ${seasonString}`);
    debug(`📅 API-Parameter: season_in=${seasonYear}`);
    debug('====================================');

    // 1. Club-Daten laden
    //const clubData = await apiClient.fetchClubData();
    //const members = clubData.user || [];
    const { members, flights, flightsByUser } = await apiClient.fetchActiveClubMembersForSeason(parseInt(seasonYear));
    console.log(`✅ Verarbeite ${members.length} aktive Piloten (statt alle Club-Mitglieder)`);

    //debug('Mitglieder:', members);
    const clubData = await apiClient.fetchClubData();
    const allMembers = clubData.user || [];
    console.log(`📊 ${allMembers.length} Club-Mitglieder gefunden`);

    // 2. Lade NUR Flüge der gewählten Saison
    const seasonFlights = await loadFlightsForSeason(allMembers, parseInt(seasonYear), seasonString);


    // 3. Lade Sprint-Daten
    console.log('📊 Lade Sprint-Daten...');
    const sprintData = await sprintDataService.loadAllMembersSprints(members, parseInt(seasonYear));
    console.log(`✅ ${sprintData.length} Sprints geladen`);

    // 4. Lade historische Pilotenfaktoren aus JSON
    const historicalFactors = await loadPilotFactorsFromJSON(seasonYear);

    // 5. Verarbeite Mitglieder
    const processedMembers = await processMembers(
      allMembers,
      seasonFlights,
      sprintData,
      historicalFactors,
      parseInt(seasonYear)
    );

    // 6. Berechne Statistiken
    const stats = calculateSeasonStatistics(processedMembers, seasonString);
    const sprintStats = sprintDataService.generateSprintStatistics(sprintData, parseInt(seasonYear));

    debug('✅ Datenverarbeitung abgeschlossen!');
    debug(`   → ${processedMembers.length} Piloten verarbeitet`);
    debug(`   → ${stats.totalFlights} Flüge in Saison ${seasonString}`);

    return {
      pilots: processedMembers,
      stats,
      sprintStats,
      season: seasonString,
      seasonYear: parseInt(seasonYear),
      isComplete: true
    };

  } catch (error) {
    console.error('❌ Fehler beim Laden der Saison:', error);
    throw error;
  }
}

// Fallback für aktuelle Saison
export async function fetchAllWeGlideData() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const seasonYear = currentMonth >= 10 ? currentYear + 1 : currentYear;

  return fetchAllWeGlideDataForSeason(seasonYear.toString());
}

// =============================================================================
// DATENLADE-FUNKTIONEN
// =============================================================================

async function loadFlightsForSeason(members, seasonYear, seasonLabel) {
  debug(`📂 Lade Flüge für ${seasonLabel}...`);


  const allFlights = [];


  const kurtMember = members.find(m => m.name.includes('Sauter'));
  if (kurtMember) {
    console.log('✅ Kurt Sauter in Mitgliederliste:', kurtMember);
  } else {
    console.log('❌ Kurt Sauter NICHT in Mitgliederliste');
  }

  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE);

    // Debug: In welchem Batch ist Kurt?
    if (batch.find(m => m.name.includes('Sauter'))) {
      console.log(`Kurt Sauter ist in Batch ${Math.floor(i / BATCH_SIZE) + 1}`);
    }

    const batchPromises = batch.map(async (member) => {

      try {
        const flights = await apiClient.fetchUserFlights(member.id, seasonYear);

        if (member.name.includes('Sauter')) {
          console.log(`Kurt Sauter Flüge geladen: ${flights.length}`);
        }


        return flights.map(flight => ({
          ...flight,
          user: { id: member.id, name: member.name }
        }));
      } catch (error) {
        debug(`Fehler bei ${member.name}:`, error.message);
        return [];
      }
    });

    const batchResults = await Promise.all(batchPromises);
    allFlights.push(...batchResults.flat());

    // Debug: Sind Kurts Flüge in allFlights?
    const kurtFlights = allFlights.filter(f => f.user?.name?.includes('Sauter'));
    console.log(`Kurt Sauter Flüge in allFlights: ${kurtFlights.length}`);

    if (i + BATCH_SIZE < members.length) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }
  }

  debug(`✅ ${allFlights.length} Flüge geladen`);
  return allFlights;
}

async function loadPilotFactorsFromJSON(seasonYear) {
  try {
    const filename = `./data/pilot-factors-${seasonYear - 1}.json`;
    console.log(`📄 Lade Pilotenfaktoren der Vorsaison aus ${filename}`);

    const response = await fetch(filename);

    if (!response.ok) {
      console.log(`ℹ️ Keine Pilotenfaktoren für Vorsaison gefunden, verwende Defaults`);
      return {};
    }

    const data = await response.json();
    console.log(`✅ Pilotenfaktoren geladen: ${Object.keys(data.pilots || {}).length} Piloten aus Saison ${data.metadata?.season || 'unbekannt'}`);

    // Konvertiere zu Name→Faktor Mapping
    const factors = {};
    Object.values(data.pilots || {}).forEach(pilot => {
      factors[pilot.name] = {
        factor: pilot.factor,
        bestDistance: pilot.bestDistance || 0
      };
    });

    return factors;
  } catch (error) {
    console.warn(`Fehler beim Laden der Pilotenfaktoren:`, error);
    return {};
  }
}

// =============================================================================
// MITGLIEDER-VERARBEITUNG
// =============================================================================

async function processMembers(members, seasonFlights, sprintData, historicalFactors, seasonYear) {
  const flightsByUser = groupByUserId(seasonFlights);
  const sprintsByUser = groupByUserId(sprintData);
  // Debug
  const kurtMember = members.find(m => m.name.includes('Sauter'));
  if (kurtMember) {
    const kurtFlights = flightsByUser.get(kurtMember.id);
    console.log(`Kurt Sauter (ID: ${kurtMember.id}) hat ${kurtFlights?.length || 0} Flüge in flightsByUser`);
  } else {
    console.log('Kurt Sauter NICHT in Mitgliederliste');
  }

  const processedMembers = [];

  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (member) => {
      try {
        const userId = member.id;
        const userFlights = flightsByUser.get(userId) || [];
        const userSprints = sprintsByUser.get(userId) || [];
        debug(`\n🔍 Verarbeite ${member.name} (${userFlights.length} Flüge, ${userSprints.length} Sprints)`);

        // Filtere eigene Flüge (nicht als Co-Pilot)
        const ownFlights = userFlights.filter(flight =>
          !checkIfPilotIsCoPilot(flight, userId)
        );

        // Hole historischen Faktor aus JSON
        const historicalData = historicalFactors[member.name] || {};
        const startingFactor = historicalData.factor || 4.0;
        const startingBestDistance = historicalData.bestDistance || 0;

        debug(`  ${member.name}: ${ownFlights.length} Flüge, Start-Faktor: ${startingFactor}`);

        // Badge-Berechnung mit multi-level-badge-evaluator
        const badgeAnalysis = await calculateUserSeasonBadgesWithConfig(
          userId,
          member.name,
          ownFlights,  // historische Flüge
          ownFlights,  // Season-Flüge (gleiche in diesem Fall)
          seasonYear
        );

        return processMemberData(
          member,
          ownFlights,
          userSprints,
          badgeAnalysis,
          startingFactor,
          startingBestDistance,
          seasonYear
        );

      } catch (error) {
        console.error(`Fehler bei ${member.name}:`, error);
        return createEmptyMemberData(member);
      }
    });

    const batchResults = await Promise.all(batchPromises);
    processedMembers.push(...batchResults.filter(m => m !== null));
  }

  return processedMembers;
}

function processMemberData(member, flights, sprints, badgeAnalysis, startingFactor, startingBestDistance, seasonYear) {
  const processedFlights = flights.map(flight => processFlightData(flight));

  // Sortiere ALLE Flüge chronologisch
  const allFlightsSorted = [...processedFlights].sort((a, b) =>
    new Date(a.date) - new Date(b.date)
  );

  let currentFactor = startingFactor;
  let currentBestDistance = startingBestDistance;

  // Verarbeite Flüge chronologisch
  const flightsWithFactors = allFlightsSorted.map((flight, index) => {
    // Prüfe ob mit Fluglehrer geflogen wurde
    const instructorFactor = getInstructorFlightFactor(flight.coPilotName);

    let flightFactor;
    if (instructorFactor !== null) {
      // Schulungsflug: Verwende Fluglehrer-Faktor
      flightFactor = instructorFactor;
      console.log(`${member.name}: Schulungsflug mit ${flight.coPilotName}, Faktor ${instructorFactor}`);
    } else {
      // Normaler Flug: Verwende Piloten-Faktor
      flightFactor = currentFactor;
    }

    const flightWithFactor = {
      ...flight,
      pilotFactor: flightFactor,
      isTrainingFlight: instructorFactor !== null
    };

    // NUR wenn KEIN Fluglehrer: Prüfe ob sich der normale Faktor verbessert
    if (instructorFactor === null && flight.km > currentBestDistance) {
      currentBestDistance = flight.km;

      // Berechne neuen Faktor für NÄCHSTEN normalen Flug
      if (currentBestDistance <= 50) {
        currentFactor = 4.0;
      } else if (currentBestDistance <= 100) {
        currentFactor = 3.0;
      } else if (currentBestDistance <= 300) {
        currentFactor = 2.0;
      } else if (currentBestDistance <= 500) {
        currentFactor = 1.6;
      } else if (currentBestDistance <= 700) {
        currentFactor = 1.4;
      } else if (currentBestDistance <= 1000) {
        currentFactor = 1.2;
      } else {
        currentFactor = 1.0;
      }

      console.log(`${member.name}: Neuer Standard-Faktor ${currentFactor} ab nächstem Solo-Flug`);
    }

    return flightWithFactor;
  });

  // Punkteberechnung
  const rankingFlights = flightsWithFactors;

  rankingFlights.forEach(flight => {
    const aircraftFactor = getAircraftFactor(flight.aircraftType);
    flight.points = flight.km * flight.pilotFactor * aircraftFactor * flight.takeoffFactor;
    flight.aircraftFactor = aircraftFactor;
  });

  const bestFlights = [...rankingFlights]
    .sort((a, b) => b.points - a.points)
    .slice(0, APP_CONFIG.BEST_FLIGHTS_COUNT || 3);

  const totalPoints = bestFlights.reduce((sum, flight) => sum + flight.points, 0);


  return {
    name: member.name,
    userId: member.id,
    totalPoints,
    flights: bestFlights,
    allFlights: flightsWithFactors,
    rankingFlights,

    // Badge-Daten von multi-level-badge-evaluator
    badges: badgeAnalysis.badges || [],
    badgeCount: badgeAnalysis.seasonBadgeCount || 0,
    badgeCategoryCount: badgeAnalysis.badgeCategoryCount || 0,
    allTimeBadgeCount: badgeAnalysis.allTimeBadgeCount || 0,
    seasonBadgePoints: badgeAnalysis.seasonBadgeCount || 0,
    allTimeBadgePoints: badgeAnalysis.allTimeBadgeCount || 0,
    flightsWithBadges: badgeAnalysis.flightsWithBadges || 0,
    flightsAnalyzed: badgeAnalysis.flightsAnalyzed || 0,
    multiLevelBadgeCount: badgeAnalysis.multiLevelCount || 0,

    // Pilotenfaktor-Daten
    pilotFactor: currentFactor,
    startingFactor,
    bestDistance: currentBestDistance,
    seasonBestDistance: currentBestDistance - startingBestDistance,

    // Sprint-Daten
    sprintData: sprints,
    sprintStats: calculateSprintStats(sprints),

    season: seasonYear
  };
}

// =============================================================================
// HILFSFUNKTIONEN
// =============================================================================

function processFlightData(flight) {
  if (!flight) return null;

  const date = flight.scoring_date || flight.takeoff_time;
  const takeoffAirport = flight.takeoff_airport?.name || 'Unbekannt';

  let duration = 0;
  if (flight.takeoff_time && flight.landing_time) {
    const takeoff = new Date(flight.takeoff_time);
    const landing = new Date(flight.landing_time);
    duration = (landing - takeoff) / 1000; // Duration in Sekunden
  }

  return {
    km: flight.contest?.distance || 0,
    speed: flight.contest?.speed || 0,
    originalPoints: flight.contest?.points || 0,
    aircraftType: flight.aircraft?.name || 'Unbekannt',
    date,
    takeoffAirportName: takeoffAirport,
    takeoffFactor: getAirfieldFactor(takeoffAirport),
    coPilotName: getCoPilotName(flight),
    flightYear: new Date(date).getFullYear(),
    duration: duration,
    rawData: flight
  };
}

function getCoPilotName(flight) {
  if (!flight) return null;

  if (flight.co_user) {
    if (typeof flight.co_user === 'object' && flight.co_user.name) {
      return flight.co_user.name;
    }
    if (typeof flight.co_user === 'string') {
      return flight.co_user;
    }
  }

  return flight.co_user_name || null;
}

function getAirfieldFactor(airfieldName) {
  return AIRFIELD_FACTORS[airfieldName] || AIRFIELD_FACTORS.DEFAULT;
}

function groupByUserId(items) {
  const grouped = new Map();

  items.forEach(item => {
    const userId = item.user?.id || item.pilotId || item.user_id;
    if (!userId) return;

    if (!grouped.has(userId)) {
      grouped.set(userId, []);
    }
    grouped.get(userId).push(item);
  });

  return grouped;
}

function calculateSprintStats(sprints) {
  if (!sprints || sprints.length === 0) {
    return {
      totalSprints: 0,
      bestSpeed: 0,
      bestDistance: 0,
      averageSpeed: 0
    };
  }

  const speeds = sprints.map(s => s.contest?.speed || 0);
  const distances = sprints.map(s => s.contest?.distance || 0);

  return {
    totalSprints: sprints.length,
    bestSpeed: Math.max(...speeds),
    bestDistance: Math.max(...distances),
    averageSpeed: speeds.reduce((a, b) => a + b, 0) / speeds.length
  };
}

function createEmptyMemberData(member) {
  return {
    name: member.name,
    userId: member.id,
    totalPoints: 0,
    flights: [],
    allFlights: [],
    rankingFlights: [],
    pilotFactor: 4.0,
    badges: [],
    badgeCount: 0,
    badgeCategoryCount: 0,
    allTimeBadgeCount: 0
  };
}



function calculateSeasonStatistics(members, seasonString) {
  const stats = {
    totalFlights: 0,
    totalKm: 0,
    longestFlight: 0,
    longestFlightPilot: '',
    longestFlightDate: null,  // NEU
    maxWeGlidePoints: 0,
    maxWeGlidePointsPilot: '',
    maxWeGlidePointsDate: null,  // NEU
    totalPilots: 0,
    season: seasonString
  };

  const activePilots = new Set();
  const countedFlightIds = new Set();

  members.forEach(member => {
    if (member.allFlights?.length > 0) {
      activePilots.add(member.name);

      member.allFlights.forEach(flight => {
        // Prüfe ob Pilot selbst geflogen ist (nicht als Co-Pilot)
        const isOwnFlight = !flight.coPilotName || flight.coPilotName !== member.name;

        // Verwende flight.id um Doppelzählungen zu vermeiden
        const flightId = flight.rawData?.id || `${flight.date}-${flight.km}`;

        if (isOwnFlight && !countedFlightIds.has(flightId)) {
          countedFlightIds.add(flightId);
          stats.totalFlights++;
          stats.totalKm += flight.km || 0;

          if ((flight.km || 0) > stats.longestFlight) {
            stats.longestFlight = flight.km || 0;
            stats.longestFlightPilot = member.name;
            stats.longestFlightDate = flight.date;
          }

          if ((flight.originalPoints || 0) > stats.maxWeGlidePoints) {
            stats.maxWeGlidePoints = flight.originalPoints || 0;
            stats.maxWeGlidePointsPilot = member.name;
            stats.maxWeGlidePointsDate = flight.date;
          }
        }
      });
    }
  });

  stats.totalPilots = activePilots.size;

  return stats;
}