// /public/js/core/data-processor.js
/**
 * SG Säntis Cup - Datenverarbeitungsmodul
 * Version 5.0 - Optimiert: Historische Daten für Pilotenfaktor und Badge-Berechnung
 */

import { apiClient } from '../services/weglide-api-service.js';
//import { calculateUserSeasonBadgesOptimized } from '../services/optimized-badge-evaluator-v3.js';
import { calculateUserSeasonBadgesSimplified } from '../services/simplified-badge-evaluator.js';
import { sprintDataService } from '../services/sprint-data-service.js';
import {
  APP_CONFIG,
  PILOT_FACTORS,
  FLIGHT_INSTRUCTORS,
  HISTORICAL_PILOT_FACTORS,
  AIRFIELD_FACTORS,
  getAircraftFactor
} from '../config/constants.js';
import { formatISODateTime, formatDateForDisplay } from '../utils/utils.js';
import { checkIfPilotIsCoPilot } from './flight-analyzer.js';

// =============================================================================
// KONSTANTEN
// =============================================================================

const DEBUG = true; // Debug-Modus ein/ausschalten

const CACHE_CONFIG = {
  KEY: 'sgSaentis_historicalFlights',
  MAX_AGE: 24 * 60 * 60 * 1000, // 24 Stunden
  BATCH_SIZE: 15,
  RATE_LIMIT_DELAY: 100 // ms
};

const HISTORICAL_YEARS = [2023, 2024];
const CURRENT_YEAR = new Date().getFullYear();

// Debug-Funktion
function debug(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

// =============================================================================
// CACHE FUNKTIONEN
// =============================================================================

/**
 * Lädt gecachte historische Daten aus dem LocalStorage
 */
async function loadCachedHistoricalData() {
  try {
    const cached = localStorage.getItem(CACHE_CONFIG.KEY);
    if (!cached) {
      debug('📭 Kein Cache für historische Daten gefunden');
      return [];
    }
    
    const { timestamp, data } = JSON.parse(cached);
    const cacheAge = Date.now() - timestamp;
    
    if (cacheAge > CACHE_CONFIG.MAX_AGE) {
      debug('⏰ Cache für historische Daten ist abgelaufen');
      localStorage.removeItem(CACHE_CONFIG.KEY);
      return [];
    }
    
    debug(`✅ ${data.length} historische Flüge aus Cache geladen (${Math.round(cacheAge / 1000 / 60)} Minuten alt)`);
    return data;
  } catch (error) {
    debug('Fehler beim Laden des Caches:', error);
    return [];
  }
}

/**
 * Speichert historische Daten im LocalStorage
 */
async function cacheHistoricalData(flights) {
  try {
    const cacheData = {
      timestamp: Date.now(),
      data: flights
    };
    localStorage.setItem(CACHE_CONFIG.KEY, JSON.stringify(cacheData));
    debug(`💾 ${flights.length} historische Flüge im Cache gespeichert`);
  } catch (error) {
    debug('Fehler beim Cachen der Daten:', error);
    try {
      localStorage.removeItem(CACHE_CONFIG.KEY);
      debug('🗑️ Alter Cache gelöscht');
    } catch (e) {
      debug('Cache konnte nicht gelöscht werden:', e);
    }
  }
}

// =============================================================================
// UI FUNKTIONEN
// =============================================================================

/**
 * Zeigt einen Hintergrund-Lade-Indikator
 */
function showBackgroundLoadingIndicator() {
  if (document.getElementById('background-loading')) return;
  
  const indicator = document.createElement('div');
  indicator.id = 'background-loading';
  indicator.className = 'background-loading-indicator';
  indicator.innerHTML = `
    <div class="loading-pulse"></div>
    <span>Lade historische Daten...</span>
  `;
  
  Object.assign(indicator.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    background: 'var(--primary-dark, #1e3a8a)',
    color: 'white',
    padding: '12px 20px',
    borderRadius: '25px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
    zIndex: '1000',
    fontSize: '14px',
    transition: 'all 0.3s ease'
  });
  
  document.body.appendChild(indicator);
}

/**
 * Versteckt den Hintergrund-Lade-Indikator
 */
function hideBackgroundLoadingIndicator() {
  const indicator = document.getElementById('background-loading');
  if (indicator) {
    indicator.classList.add('fade-out');
    setTimeout(() => indicator.remove(), 300);
  }
}

/**
 * UI Update Funktion
 */
function updateUIWithData(data) {
  if (window.sgApp?.updateUI) {
    window.sgApp.pilotData = data.pilots;
    window.sgApp.stats = data.stats;
    window.sgApp.updateUI();
  }
}

// =============================================================================
// DATENLADE-FUNKTIONEN
// =============================================================================

/**
 * Lädt Flüge für mehrere Nutzer parallel
 */
async function loadFlightsForMembers(members, years, label) {
  debug(`📂 Lade ${label}...`);
  
  const allFlights = [];
  const yearArray = Array.isArray(years) ? years : [years];
  
  for (let i = 0; i < members.length; i += CACHE_CONFIG.BATCH_SIZE) {
    const batch = members.slice(i, i + CACHE_CONFIG.BATCH_SIZE);
    
    const batchPromises = batch.map(async (member) => {
      try {
        const yearPromises = yearArray.map(year => 
          apiClient.fetchUserFlights(member.id, year)
        );
        
        const yearResults = await Promise.all(yearPromises);
        
        return yearResults.flat().map(flight => ({
          ...flight,
          user: { id: member.id, name: member.name }
        }));
      } catch (error) {
        if (DEBUG) console.error(`Fehler bei ${member.name}:`, error);
        return [];
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    allFlights.push(...batchResults.flat());
    
    const progress = Math.min(i + CACHE_CONFIG.BATCH_SIZE, members.length);
    debug(`  ${label}: ${progress}/${members.length} Piloten`);
    
    if (i + CACHE_CONFIG.BATCH_SIZE < members.length) {
      await new Promise(resolve => setTimeout(resolve, CACHE_CONFIG.RATE_LIMIT_DELAY));
    }
  }
  
  debug(`✅ ${allFlights.length} Flüge geladen`);
  return allFlights;
}

/**
 * Gruppiert Daten nach User ID
 */
function groupByUserId(items, idField = 'user') {
  const grouped = new Map();
  
  items.forEach(item => {
    const userId = idField === 'user' ? item.user?.id : (item.pilotId || item.user_id);
    if (!userId) return;
    
    if (!grouped.has(userId)) {
      grouped.set(userId, []);
    }
    grouped.get(userId).push(item);
  });
  
  return grouped;
}

// =============================================================================
// PILOTENFAKTOR-BERECHNUNG
// =============================================================================

/**
 * Berechnet die Pilotenfaktoren chronologisch
 */
function calculatePilotFactorsChronologically(flights, pilotName, historicalFactor = null) {
  const sortedFlights = [...flights].sort((a, b) => {
    const dateA = new Date(a.date || a.scoring_date || a.takeoff_time);
    const dateB = new Date(b.date || b.scoring_date || b.takeoff_time);
    return dateA - dateB;
  });

  let currentMaxDistance = 0;
  let currentPilotFactor;

  // Initialisierung basierend auf historischem Faktor
  if (historicalFactor && historicalFactor !== HISTORICAL_PILOT_FACTORS.DEFAULT) {
    currentPilotFactor = historicalFactor;
    // Geschätzte Startdistanz basierend auf Faktor
    const factorDistanceMap = {
      1.0: 1000,
      1.2: 700,
      1.4: 500,
      1.6: 300,
      2.0: 100,
      3.0: 50
    };
    currentMaxDistance = factorDistanceMap[historicalFactor] || 0;
    debug(`📌 ${pilotName} hat historischen Faktor ${historicalFactor} (geschätzte Vorleistung: ${currentMaxDistance}km)`);
  } else {
    currentPilotFactor = 4.0;
    debug(`📌 ${pilotName} hat keinen historischen Faktor - Start bei 4.0`);
  }

  // Chronologische Verarbeitung
  sortedFlights.forEach((flight) => {
    flight.pilotFactor = currentPilotFactor;
    flight.pFactor = currentPilotFactor;
    
    if (flight.km > currentMaxDistance) {
      currentMaxDistance = flight.km;
      const newFactor = calculatePilotFactor(currentMaxDistance);
      
      if (newFactor !== currentPilotFactor) {
        debug(`  → Neue Schwelle erreicht! Faktor ändert sich von ${currentPilotFactor} auf ${newFactor}`);
        currentPilotFactor = newFactor;
      }
    }
  });

  return sortedFlights;
}

/**
 * Berechnet den Pilotenfaktor basierend auf der Distanz
 */
export function calculatePilotFactor(distance) {
  for (const factor of PILOT_FACTORS) {
    if (distance <= factor.maxKm) {
      return factor.factor;
    }
  }
  return 1.0;
}

// =============================================================================
// FLUGDATEN-VERARBEITUNG
// =============================================================================

/**
 * Verarbeitet Flugdaten
 */
export function processFlightData(flight) {
  if (!flight) return null;

  const date = flight.scoring_date || flight.takeoff_time;
  const takeoffAirport = flight.takeoff_airport?.name || 'Unbekannt';

  return {
    km: flight.contest?.distance || 0,
    speed: flight.contest?.speed || 0,
    originalPoints: flight.contest?.points || 0,
    aircraftType: flight.aircraft?.name || 'Unbekannt',
    date,
    takeoffAirportName: takeoffAirport,
    takeoffFactor: getAirfieldFactor(takeoffAirport),
    coPilotName: getCoPliotName(flight),
    flightYear: new Date(date).getFullYear(),
    rawData: flight
  };
}

/**
 * Extrahiert Co-Pilot Namen
 */
export function getCoPliotName(flight) {
  if (!flight) return null;

  if (flight.co_user) {
    if (typeof flight.co_user === 'object' && flight.co_user.name) {
      return flight.co_user.name;
    } else if (typeof flight.co_user === 'string') {
      return flight.co_user;
    }
  }

  return flight.co_user_name || null;
}

/**
 * Prüft ob Flug für Wertung zählt
 */
export function countsForScoring(flight, includeFlightsWithInstructor = false) {
  if (!flight) return false;
  if (includeFlightsWithInstructor) return true;

  const coPilotName = getCoPliotName(flight);
  return !(coPilotName && FLIGHT_INSTRUCTORS.includes(coPilotName));
}

/**
 * Holt den Flugplatzfaktor
 */
function getAirfieldFactor(airfieldName) {
  return AIRFIELD_FACTORS[airfieldName] || AIRFIELD_FACTORS.DEFAULT;
}

// =============================================================================
// MITGLIEDER-VERARBEITUNG
// =============================================================================

/**
 * Verarbeitet Member-Daten
 */
function processMemberData(member, flights2025, historicalFlights, sprints2025, badgeAnalysis, currentYear) {
  const configuredHistoricalFactor = HISTORICAL_PILOT_FACTORS[member.name];
  const hasHistoricalFactor = configuredHistoricalFactor && configuredHistoricalFactor !== HISTORICAL_PILOT_FACTORS.DEFAULT;
  
  // Kombiniere und sortiere alle Flüge chronologisch
  const allFlightsRaw = [...historicalFlights, ...flights2025];
  allFlightsRaw.sort((a, b) => {
    const dateA = new Date(a.date || a.scoring_date || a.takeoff_time);
    const dateB = new Date(b.date || b.scoring_date || b.takeoff_time);
    return dateA - dateB;
  });

  // Verarbeite Flugdaten
  const allFlights = allFlightsRaw.map(flight => processFlightData(flight));
  
  // Berechne Pilotenfaktoren chronologisch
  calculatePilotFactorsChronologically(allFlights, member.name, configuredHistoricalFactor);
  
  // Separiere Flüge nach Jahr
  const processedFlights = allFlights.filter(f => f.flightYear === currentYear);
  const processedHistoricalFlights = allFlights.filter(f => f.flightYear < currentYear);
  
  // Bestimme aktuellen Pilotenfaktor
  let currentPilotFactor;
  if (allFlights.length > 0) {
    currentPilotFactor = allFlights[allFlights.length - 1].pilotFactor;
  } else if (hasHistoricalFactor) {
    currentPilotFactor = configuredHistoricalFactor;
  } else {
    currentPilotFactor = 4.0;
  }
  
  // Berechne Ranking-Flüge
  const rankingFlights = processedFlights.filter(flight => countsForScoring(flight, false));

  // Berechne Punkte
  rankingFlights.forEach(flight => {
    const aircraftFactor = getAircraftFactor(flight.aircraftType);
    flight.points = flight.km * flight.pilotFactor * aircraftFactor * flight.takeoffFactor;
    flight.flzFaktor = aircraftFactor;
    flight.aircraftFactor = aircraftFactor;
  });

  // Beste Flüge
  rankingFlights.sort((a, b) => b.points - a.points);
  const bestFlights = rankingFlights.slice(0, APP_CONFIG.BEST_FLIGHTS_COUNT);
  const totalPoints = bestFlights.reduce((sum, flight) => sum + flight.points, 0);

  // Sprint-Statistiken
  const sprintStats = calculatePilotSprintStats(sprints2025);

  // Beste historische Distanz
  const bestHistoricalDistance = allFlights.length > 0 ?
    Math.max(...allFlights.map(f => f.km)) : 0;

  return {
    name: member.name,
    userId: member.id,
    totalPoints,
    flights: bestFlights,
    allFlights: processedFlights,
    rankingFlights,
    historicalFlights: processedHistoricalFlights,

    // Sprint-Daten
    sprintData: sprints2025,
    sprintStats,
    topSpeedSprints: sprints2025
      .sort((a, b) => (b.contest?.speed || 0) - (a.contest?.speed || 0))
      .slice(0, 5),
    topDistanceSprints: sprints2025
      .sort((a, b) => (b.contest?.distance || 0) - (a.contest?.distance || 0))
      .slice(0, 5),

    // Pilotenfaktoren
    pilotFactor: currentPilotFactor,
    historicalPilotFactor: configuredHistoricalFactor || HISTORICAL_PILOT_FACTORS.DEFAULT,
    hasConfiguredHistoricalFactor: hasHistoricalFactor,
    bestHistoricalDistance,
    pilotFactorHistory: allFlights.map(f => ({
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
    
    // NEU: Badge-Punkte von badgeAnalysis übernehmen
    seasonBadgePoints: badgeAnalysis.seasonBadgePoints || 0,
    allTimeBadgePoints: badgeAnalysis.allTimeBadgePoints || 0,
    verifiedBadgeCount: badgeAnalysis.verifiedBadgeCount || 0,

    season: currentYear
  };
}

/**
 * Verarbeitet alle Mitglieder
 */
async function processMembersOptimized(members, flightsByUser, historicalFlightsByUser, sprintsByUser, loadBadgeHistoryForUser, currentYear) {
  const processedMembers = [];

  for (let i = 0; i < members.length; i += CACHE_CONFIG.BATCH_SIZE) {
    const batch = members.slice(i, i + CACHE_CONFIG.BATCH_SIZE);

    const batchPromises = batch.map(async (member) => {
      try {
        const userId = member.id;
        const userFlights2025 = flightsByUser.get(userId) || [];
        const userHistoricalFlights = historicalFlightsByUser.get(userId) || [];
        const userSprints2025 = sprintsByUser.get(userId) || [];

        // Filtere eigene Flüge
        const ownFlights2025 = userFlights2025.filter(flight =>
          !checkIfPilotIsCoPilot(flight, userId)
        );
        const ownHistoricalFlights = userHistoricalFlights.filter(flight =>
          !checkIfPilotIsCoPilot(flight, userId)
        );

        debug(`  ${member.name}: ${ownFlights2025.length} Flüge 2025, ${ownHistoricalFlights.length} historische Flüge, ${userSprints2025.length} Sprints`);

        // Badge-Berechnung
        let badgeAnalysis;
        if (ownFlights2025.length > 0) {
          const detailedHistoricalFlights = await loadBadgeHistoryForUser(userId);
          //badgeAnalysis = await calculateUserSeasonBadgesOptimized(
          //  userId,
          //  member.name,
          //  [...detailedHistoricalFlights, ...ownFlights2025],
          //  ownFlights2025
          //);
          badgeAnalysis = await calculateUserSeasonBadgesSimplified(userId, member.name);
        } else {
          badgeAnalysis = createEmptyBadgeResult(userId, member.name);
        }

        return processMemberData(
          member,
          ownFlights2025,
          ownHistoricalFlights,
          userSprints2025,
          badgeAnalysis,
          currentYear
        );

      } catch (error) {
        if (DEBUG) console.error(`❌ Fehler bei ${member.name}:`, error.message);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    processedMembers.push(...batchResults.filter(m => m !== null));

    debug(`  Fortschritt: ${Math.min(i + CACHE_CONFIG.BATCH_SIZE, members.length)}/${members.length} Piloten`);
  }

  return processedMembers;
}

// =============================================================================
// STATISTIKEN
// =============================================================================

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

/**
 * Berechnet Saison-Statistiken
 */
function calculateSeasonStatistics(members, season) {
  const stats = {
    totalFlights: 0,
    totalKm: 0,
    longestFlight: 0,
    longestFlightPilot: '',
    maxWeGlidePoints: 0,
    maxWeGlidePointsPilot: '',
    activePilots: new Set(),
    season
  };

  members.forEach(member => {
    if (!member?.allFlights?.length) return;

    stats.activePilots.add(member.name);

    member.allFlights.forEach(flight => {
      stats.totalFlights++;
      stats.totalKm += flight.km || 0;

      if ((flight.km || 0) > stats.longestFlight) {
        stats.longestFlight = flight.km || 0;
        stats.longestFlightPilot = member.name;
      }

      if ((flight.originalPoints || 0) > stats.maxWeGlidePoints) {
        stats.maxWeGlidePoints = flight.originalPoints || 0;
        stats.maxWeGlidePointsPilot = member.name;
      }
    });
  });

  return {
    ...stats,
    totalPilots: stats.activePilots.size
  };
}

/**
 * Erstellt ein leeres Badge-Ergebnis
 */
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
    flightsWithBadges: 0,
    allTimeBadges: [],
    allTimeBadgeCount: 0,
    // NEU: Badge-Punkte mit 0 initialisieren
    seasonBadgePoints: 0,
    allTimeBadgePoints: 0,
    verifiedBadgeCount: 0
  };
}

/**
 * Erstellt einen Badge-History-Loader
 */
function createBadgeHistoryLoader(allClubFlights) {
  const historyCache = new Map();

  return async function (userId) {
    if (historyCache.has(userId)) {
      return historyCache.get(userId);
    }

    debug(`  📜 Lade Badge-Historie für User ${userId}...`);

    const userHistoricalFlights = allClubFlights.filter(flight => {
      if (flight.user?.id !== userId) return false;

      const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
      const flightYear = flightDate.getFullYear();

      return flightYear >= 2023 && flightYear <= 2024;
    });

    historyCache.set(userId, userHistoricalFlights);
    debug(`    → ${userHistoricalFlights.length} historische Flüge gefunden`);

    return userHistoricalFlights;
  };
}

// =============================================================================
// HAUPTEXPORT
// =============================================================================

/**
 * Lädt alle Daten der SG Säntis Mitglieder von WeGlide
 */
export async function fetchAllWeGlideData() {
  try {
    debug('====================================');
    debug('🚀 Starte Zwei-Phasen Daten-Loading v6.0');
    debug('====================================');

    // Phase 1: Schnelles Initial-Loading
    debug('\n📋 Phase 1: Schnell-Start mit Cache und aktueller Saison...');
    
    const clubData = await apiClient.fetchClubData();
    const members = clubData.user || [];
    
    // Cache prüfen
    const cachedHistoricalData = await loadCachedHistoricalData();
    
    // Aktuelle Saison laden
    const season2025Flights = await loadFlightsForMembers(members, CURRENT_YEAR, `Saison ${CURRENT_YEAR} Flüge`);
    
    // Daten gruppieren
    const flightsByUser = groupByUserId(season2025Flights);
    let historicalFlightsByUser = new Map();
    
    if (cachedHistoricalData.length > 0) {
      debug('✅ Verwende gecachte historische Daten');
      historicalFlightsByUser = groupByUserId(cachedHistoricalData);
    }
    
    // Sprint-Daten laden
    debug('\n🏃 Lade Sprint-Daten 2025...');
    const sprintData2025 = await sprintDataService.loadAllMembersSprints(members, CURRENT_YEAR);
    const sprintsByUser = groupByUserId(sprintData2025, 'sprint');
    
    // Badge-Loader erstellen
    const loadBadgeHistoryForUser = createBadgeHistoryLoader([...cachedHistoricalData, ...season2025Flights]);
    
    // Erste Verarbeitung
    let processedMembers = await processMembersOptimized(
      members,
      flightsByUser,
      historicalFlightsByUser,
      sprintsByUser,
      loadBadgeHistoryForUser,
      CURRENT_YEAR
    );
    
    // Statistiken
    let stats = calculateSeasonStatistics(processedMembers, CURRENT_YEAR);
    const sprintStats = sprintDataService.generateSprintStatistics(sprintData2025, CURRENT_YEAR);
    
    // UI Update
    const initialResult = {
      pilots: processedMembers,
      stats,
      sprintStats,
      isComplete: false
    };
    
    updateUIWithData(initialResult);
    
    // Phase 2: Historische Daten im Hintergrund
    debug('\n📋 Phase 2: Lade historische Daten im Hintergrund...');
    showBackgroundLoadingIndicator();
    
    const fullHistoricalFlights = await loadFlightsForMembers(members, HISTORICAL_YEARS, 'Historische Daten');
    await cacheHistoricalData(fullHistoricalFlights);
    
    // Neu verarbeiten mit vollständigen Daten
    historicalFlightsByUser = groupByUserId(fullHistoricalFlights);
    processedMembers = await processMembersOptimized(
      members,
      flightsByUser,
      historicalFlightsByUser,
      sprintsByUser,
      createBadgeHistoryLoader([...fullHistoricalFlights, ...season2025Flights]),
      CURRENT_YEAR
    );
    
    // Finale Statistiken
    stats = calculateSeasonStatistics(processedMembers, CURRENT_YEAR);
    
    hideBackgroundLoadingIndicator();
    debug('\n✅ Vollständige Datenverarbeitung abgeschlossen!');
    
    return {
      pilots: processedMembers,
      stats,
      sprintStats,
      isComplete: true
    };

  } catch (error) {
    if (DEBUG) console.error('❌ Kritischer Fehler:', error);
    hideBackgroundLoadingIndicator();
    return { pilots: [], stats: {}, sprintStats: {} };
  }
}

// =============================================================================
// DEBUG FUNKTIONEN
// =============================================================================

/**
 * Debug-Funktion für Pilotenfaktor-Entwicklung
 */
window.debugPilotFactor = function(pilotName) {
  const pilot = window.pilotData?.find(p => p.name === pilotName);
  if (!pilot) {
    console.error(`Pilot ${pilotName} nicht gefunden`);
    return;
  }

  console.log(`\n🔍 Pilotenfaktor-Entwicklung für ${pilotName}`);
  console.log('================================================');
  
  if (pilot.hasConfiguredHistoricalFactor) {
    console.log(`📌 Historischer Faktor (vor WeGlide): ${pilot.historicalPilotFactor}`);
    console.log('------------------------------------------------');
  }
  
  if (pilot.pilotFactorHistory?.length > 0) {
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
};

/**
 * Debug-Funktion für historische Faktoren
 */
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

// Re-export für Kompatibilität
export { formatISODateTime };