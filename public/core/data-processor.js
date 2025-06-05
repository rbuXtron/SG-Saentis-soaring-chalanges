// /public/js/core/data-processor.js
/**
 * SG Säntis Cup - Datenverarbeitungsmodul
 * Version 5.0 - Optimiert: Historische Daten für Pilotenfaktor und Badge-Berechnung
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
 * Version 5.0 - Lädt historische Daten für Pilotenfaktor, Badge-Details nur bei Bedarf
 */
export async function fetchAllWeGlideData() {
  try {
    console.log('====================================');
    console.log('🚀 Starte optimiertes Daten-Loading v5.0');
    console.log('====================================');

    const currentYear = new Date().getFullYear(); // 2025

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

    // 4. Sprint-Daten NUR für 2025 (separate Behandlung für Charts)
    console.log('\n🏃 Schritt 4: Lade Sprint-Daten 2025...');
    const sprintData2025 = await sprintDataService.loadAllMembersSprints(members, currentYear);
    const sprintsByUser = groupSprintsByUser(sprintData2025);
    console.log(`✅ ${sprintData2025.length} Sprint-Einträge für 2025 (nur für Charts)`);

    // 5. Badge-Historie separat laden (nur wenn benötigt)
    console.log('\n🏅 Schritt 5: Bereite Badge-Historie vor...');
    // Erstelle eine Funktion die bei Bedarf geladen wird
    const loadBadgeHistoryForUser = createBadgeHistoryLoader(allClubFlights);

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

  return async function (userId) {
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
async function processMembersOptimized(members, flightsByUser, historicalFlightsByUser, sprintsByUser, loadBadgeHistoryForUser, currentYear) {
  const processedMembers = [];
  const batchSize = 5;

  for (let i = 0; i < members.length; i += batchSize) {
    const batch = members.slice(i, i + batchSize);

    const batchPromises = batch.map(async (member) => {
      try {
        const userId = member.id;
        const userFlights2025 = flightsByUser.get(userId) || [];
        const userHistoricalFlights = historicalFlightsByUser.get(userId) || [];
        const userSprints2025 = sprintsByUser.get(userId) || [];

        // Filtere eigene Flüge (nicht als Co-Pilot)
        const ownFlights2025 = userFlights2025.filter(flight =>
          !checkIfPilotIsCoPilot(flight, userId)
        );
        const ownHistoricalFlights = userHistoricalFlights.filter(flight =>
          !checkIfPilotIsCoPilot(flight, userId)
        );

        console.log(`  ${member.name}: ${ownFlights2025.length} Flüge 2025, ${ownHistoricalFlights.length} historische Flüge, ${userSprints2025.length} Sprints`);

        // Badge-Berechnung mit Lazy-Loading der Historie
        let badgeAnalysis;
        if (ownFlights2025.length > 0) {
          // Lade zusätzliche historische Details NUR für Badge-Berechnung
          const detailedHistoricalFlights = await loadBadgeHistoryForUser(userId);

          badgeAnalysis = await calculateUserSeasonBadgesOptimized(
            userId,
            member.name,
            [...detailedHistoricalFlights, ...ownFlights2025], // Kombiniere für Badge-Analyse
            ownFlights2025  // Nur 2025 für aktuelle Saison
          );
        } else {
          // Keine Flüge = keine Badges
          badgeAnalysis = createEmptyBadgeResult(userId, member.name);
        }

        // Verarbeite Member-Daten mit historischen Flügen für Pilotenfaktor
        return processMemberData2025(
          member,
          ownFlights2025,
          ownHistoricalFlights,  // NEU: Historische Flüge für Pilotenfaktor
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
 * Berechnet die Pilotenfaktoren für alle Flüge mit chronologischer Entwicklung
 * Der Faktor ändert sich erst NACH dem Flug, der die neue Schwelle erreicht
 * 
 * @param {Array} flights - Array von Flügen
 * @param {string} pilotName - Name des Piloten
 * @param {number} historicalFactor - Historischer Faktor aus der Konfiguration (wenn vorhanden)
 */
function calculatePilotFactorsChronologically(flights, pilotName, historicalFactor = null) {
  // Sortiere Flüge chronologisch (älteste zuerst)
  const sortedFlights = [...flights].sort((a, b) => {
    const dateA = new Date(a.date || a.scoring_date || a.takeoff_time);
    const dateB = new Date(b.date || b.scoring_date || b.takeoff_time);
    return dateA - dateB;
  });

  let currentMaxDistance = 0;
  let currentPilotFactor;

  // Wenn ein historischer Faktor existiert, verwende diesen als Startpunkt
  if (historicalFactor && historicalFactor !== HISTORICAL_PILOT_FACTORS.DEFAULT) {
    currentPilotFactor = historicalFactor;
    // Setze eine hypothetische Startdistanz basierend auf dem historischen Faktor
    // Dies simuliert, dass der Pilot bereits Flüge vor WeGlide hatte
    if (historicalFactor === 1.0) currentMaxDistance = 1000;
    else if (historicalFactor === 1.2) currentMaxDistance = 700;
    else if (historicalFactor === 1.4) currentMaxDistance = 500;
    else if (historicalFactor === 1.6) currentMaxDistance = 300;
    else if (historicalFactor === 2.0) currentMaxDistance = 100;
    else if (historicalFactor === 3.0) currentMaxDistance = 50;
    
    console.log(`📌 ${pilotName} hat historischen Faktor ${historicalFactor} (geschätzte Vorleistung: ${currentMaxDistance}km)`);
  } else {
    // Kein historischer Faktor - starte bei 4.0
    currentPilotFactor = 4.0;
    console.log(`📌 ${pilotName} hat keinen historischen Faktor - Start bei 4.0`);
  }

  // Gehe durch alle Flüge chronologisch
  sortedFlights.forEach((flight, index) => {
    // Verwende den aktuellen Faktor für diesen Flug
    flight.pilotFactor = currentPilotFactor;
    flight.pFactor = currentPilotFactor;
    
    // Debug-Info
    console.log(`Flug ${index + 1}: ${formatDateForDisplay(flight.date)} - ${flight.km}km - Faktor: ${currentPilotFactor} (Max bisher: ${currentMaxDistance}km)`);
    
    // Prüfe ob dieser Flug eine neue Bestleistung ist
    if (flight.km > currentMaxDistance) {
      const previousMaxDistance = currentMaxDistance;
      currentMaxDistance = flight.km;
      
      // Berechne den neuen Faktor basierend auf der neuen Bestdistanz
      const newFactor = calculatePilotFactor(currentMaxDistance);
      
      // Wenn sich der Faktor ändert, gilt er erst ab dem NÄCHSTEN Flug
      if (newFactor !== currentPilotFactor) {
        console.log(`  → Neue Schwelle erreicht! ${previousMaxDistance}km → ${currentMaxDistance}km`);
        console.log(`     Faktor ändert sich von ${currentPilotFactor} auf ${newFactor} (ab nächstem Flug)`);
        currentPilotFactor = newFactor;
      }
    }
  });

  return sortedFlights;
}

/**
 * Überarbeitete processMemberData Funktion
 */
function processMemberData2025(member, flights2025, historicalFlights, sprints2025, badgeAnalysis, currentYear) {
  // Hole den historischen Pilotenfaktor (falls vorhanden)
  const configuredHistoricalFactor = HISTORICAL_PILOT_FACTORS[member.name];
  const hasHistoricalFactor = configuredHistoricalFactor && configuredHistoricalFactor !== HISTORICAL_PILOT_FACTORS.DEFAULT;
  
  // Kombiniere historische und aktuelle Flüge für chronologische Berechnung
  const allFlightsRaw = [...historicalFlights, ...flights2025];
  
  // Sortiere chronologisch
  allFlightsRaw.sort((a, b) => {
    const dateA = new Date(a.date || a.scoring_date || a.takeoff_time);
    const dateB = new Date(b.date || b.scoring_date || b.takeoff_time);
    return dateA - dateB;
  });

  // Verarbeite Flugdaten
  const allFlights = allFlightsRaw.map(flight => processFlightData(flight));
  
  // Berechne Pilotenfaktoren chronologisch MIT historischem Faktor
  calculatePilotFactorsChronologically(allFlights, member.name, configuredHistoricalFactor);
  
  // Trenne wieder in historische und aktuelle Flüge
  const processedFlights = allFlights.filter(f => f.flightYear === currentYear);
  const processedHistoricalFlights = allFlights.filter(f => f.flightYear < currentYear);
  
  // Finde den aktuellen Pilotenfaktor (vom letzten Flug oder historisch)
  let currentPilotFactor;
  if (allFlights.length > 0) {
    currentPilotFactor = allFlights[allFlights.length - 1].pilotFactor;
  } else if (hasHistoricalFactor) {
    // Keine Flüge, aber historischer Faktor vorhanden
    currentPilotFactor = configuredHistoricalFactor;
    console.log(`${member.name}: Keine WeGlide-Flüge, verwende historischen Faktor ${currentPilotFactor}`);
  } else {
    // Weder Flüge noch historischer Faktor
    currentPilotFactor = 4.0;
  }
  
  // Berechne Ranking-Flüge (nur 2025) mit bereits gesetzten Faktoren
  const rankingFlights = processedFlights
    .filter(flight => countsForScoring(flight, false));

  // Berechne Punkte für jeden Flug
  rankingFlights.forEach(flight => {
    const aircraftFactor = getAircraftFactor(flight.aircraftType);
    const points = flight.km * flight.pilotFactor * aircraftFactor * flight.takeoffFactor;
    
    flight.points = points;
    flight.flzFaktor = aircraftFactor;
    flight.aircraftFactor = aircraftFactor;
    
    console.log(`Flug vom ${formatDateForDisplay(flight.date)}: ${flight.km}km × ${flight.pilotFactor} × ${aircraftFactor.toFixed(3)} × ${flight.takeoffFactor} = ${points.toFixed(2)} Punkte`);
  });

  // Die besten 3 Flüge
  rankingFlights.sort((a, b) => b.points - a.points);
  const bestFlights = rankingFlights.slice(0, APP_CONFIG.BEST_FLIGHTS_COUNT);
  const totalPoints = bestFlights.reduce((sum, flight) => sum + flight.points, 0);

  // Sprint-Statistiken für 2025
  const sprintStats = calculatePilotSprintStats(sprints2025);

  // Beste historische Distanz
  const bestHistoricalDistance = allFlights.length > 0 ?
    Math.max(...allFlights.map(f => f.km)) : 0;

  return {
    name: member.name,
    userId: member.id,
    totalPoints: totalPoints,
    flights: bestFlights,
    allFlights: processedFlights,
    rankingFlights: rankingFlights,
    historicalFlights: processedHistoricalFlights,

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
    pilotFactor: currentPilotFactor, // Aktueller Faktor
    historicalPilotFactor: configuredHistoricalFactor || HISTORICAL_PILOT_FACTORS.DEFAULT,
    hasConfiguredHistoricalFactor: hasHistoricalFactor,
    bestHistoricalDistance: bestHistoricalDistance,
    pilotFactorHistory: allFlights.map(f => ({ // Historie für Debugging
      date: formatDateForDisplay(f.date),
      km: f.km,
      factor: f.pilotFactor
    })),

    // Badge-Daten
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
 * Debug-Funktion um die Pilotenfaktor-Entwicklung zu prüfen
 */
function debugPilotFactorDevelopment(pilotName) {
  const pilot = window.pilotData?.find(p => p.name === pilotName);
  if (!pilot) {
    console.error(`Pilot ${pilotName} nicht gefunden`);
    return;
  }

  console.log(`\n🔍 Pilotenfaktor-Entwicklung für ${pilotName}`);
  console.log('================================================');
  
  // Zeige historischen Faktor wenn vorhanden
  if (pilot.hasConfiguredHistoricalFactor) {
    console.log(`📌 Historischer Faktor (vor WeGlide): ${pilot.historicalPilotFactor}`);
    console.log('------------------------------------------------');
  }
  
  if (pilot.pilotFactorHistory && pilot.pilotFactorHistory.length > 0) {
    console.log('Datum          | Distanz | P-Faktor | Bemerkung');
    console.log('---------------|---------|----------|----------');
    
    let lastFactor = pilot.hasConfiguredHistoricalFactor ? pilot.historicalPilotFactor : 0;
    pilot.pilotFactorHistory.forEach((entry, index) => {
      const factorChanged = entry.factor !== lastFactor;
      let bemerkung = '';
      
      if (index === 0 && pilot.hasConfiguredHistoricalFactor) {
        bemerkung = '(Start mit hist. Faktor)';
      } else if (factorChanged && index > 0) {
        bemerkung = '← Neuer Faktor!';
      }
      
      console.log(
        `${entry.date.padEnd(14)} | ${entry.km.toFixed(0).padStart(7)} | ${entry.factor.toFixed(1).padStart(8)} | ${bemerkung}`
      );
      
      lastFactor = entry.factor;
    });
  } else {
    console.log('Keine Flüge in WeGlide erfasst');
  }
  
  console.log('================================================');
  console.log(`Aktueller Pilotenfaktor: ${pilot.pilotFactor}`);
  console.log(`Beste Distanz (WeGlide): ${pilot.bestHistoricalDistance} km`);
  
  if (pilot.hasConfiguredHistoricalFactor && pilot.pilotFactorHistory.length === 0) {
    console.log(`ℹ️  Pilot nutzt historischen Faktor, da keine WeGlide-Flüge vorhanden`);
  }
}

// Globale Debug-Funktion verfügbar machen
window.debugPilotFactor = debugPilotFactorDevelopment;

// Zusätzliche Debug-Funktion für alle Piloten mit historischen Faktoren
window.debugHistoricalFactors = function() {
  console.log('\n📌 Piloten mit historischen Faktoren:');
  console.log('=====================================');
  
  const pilotsWithHistorical = window.pilotData?.filter(p => p.hasConfiguredHistoricalFactor) || [];
  
  if (pilotsWithHistorical.length === 0) {
    console.log('Keine Piloten mit historischen Faktoren gefunden');
    return;
  }
  
  pilotsWithHistorical.forEach(pilot => {
    console.log(`\n${pilot.name}:`);
    console.log(`  Historischer Faktor: ${pilot.historicalPilotFactor}`);
    console.log(`  Aktueller Faktor: ${pilot.pilotFactor}`);
    console.log(`  WeGlide-Flüge: ${pilot.allFlights?.length || 0}`);
    console.log(`  Beste Distanz: ${pilot.bestHistoricalDistance} km`);
  });
};

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


export { formatISODateTime };