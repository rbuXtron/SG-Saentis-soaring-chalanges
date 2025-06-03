/**
 * SG Säntis Cup - Datenverarbeitungsmodul
 * 
 * Dieses Modul ist verantwortlich für:
 * - Abrufen der Daten von der WeGlide API
 * - Verarbeitung und Aufbereitung der Flugdaten
 * - Berechnung der Punkte und Faktoren
 * - Badge-Verarbeitung mit Saison-Berechnung (Subtraktion)
 * - Co-Pilot Filterung
 */

// NUR diese Imports (keine lokalen Funktionen importieren!)
import { apiClient } from '../services/weglide-api-service.js';
import { calculateSeasonBadges } from '../services/badge-season-calculator.js';
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
 * AKTUALISIERT: Mit neuer Badge-Berechnung durch Subtraktion
 * @returns {Promise<Array>} - Array mit verarbeiteten Pilotendaten
 */
export async function fetchAllWeGlideData() {
  try {
    console.log('Lade Daten von WeGlide API...');

    // 1. Club-Daten abrufen für Mitgliederliste
    const clubData = await apiClient.fetchClubData();
    console.log('Club-Daten Response:', clubData);

    if (!clubData || !clubData.user || !Array.isArray(clubData.user)) {
      console.error('Keine gültigen Club-Daten erhalten');
      return [];
    }

    const members = clubData.user;
    console.log(`${members.length} Mitglieder gefunden`);

    const currentYear = new Date().getFullYear();

    // 2. Lade die ersten 100 Club-Flüge für schnelle initiale Anzeige
    console.log(`Lade initiale Club-Flüge für ${currentYear}...`);
    const initialClubFlights = await apiClient.fetchClubFlights(currentYear, 100);
    console.log(`${initialClubFlights.length} initiale Club-Flüge geladen (Limit: 100)`);

    // 3. Lade ALLE Flüge über individuelle User-Abfragen für vollständige Statistik
    console.log('Lade vollständige Flugdaten für alle Mitglieder...');

    const allFlightsByUser = new Map();
    const batchSize = 15; // Parallel-Anfragen begrenzen

    for (let i = 0; i < members.length; i += batchSize) {
      const batch = members.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (member) => {
          try {
            const userId = member.id;
            const userFlights = await apiClient.fetchUserFlights(userId, currentYear);

            if (Array.isArray(userFlights) && userFlights.length > 0) {
              // Filtere Flüge wo der User Co-Pilot ist
              const filteredFlights = userFlights.filter(flight => {
                // Prüfe ob der User Co-Pilot in diesem Flug ist
                const isUserCoPilot = checkIfPilotIsCoPilot(flight, userId);
                if (isUserCoPilot) {
                  console.log(`  ⚠️ Flug ${flight.id} übersprungen - ${member.name} ist Co-Pilot`);
                  return false;
                }
                return true;
              });

              allFlightsByUser.set(userId, filteredFlights);
              console.log(`  ✓ ${member.name}: ${filteredFlights.length} Flüge (${userFlights.length - filteredFlights.length} als Co-Pilot übersprungen)`);
            } else {
              allFlightsByUser.set(userId, []);
            }
          } catch (error) {
            console.error(`  ✗ Fehler bei ${member.name}:`, error.message);
            allFlightsByUser.set(member.id, []);
          }
        })
      );

      // Progress
      console.log(`Fortschritt: ${Math.min(i + batchSize, members.length)}/${members.length} Mitglieder geladen`);
    }

    // 4. Verarbeite jeden Piloten mit seinen vollständigen Flügen
    const memberPromises = members.map(async member => {
      try {
        const userId = member.id;
        const currentYearFlights = allFlightsByUser.get(userId) || [];

        console.log(`Verarbeite ${member.name}: ${currentYearFlights.length} Flüge in ${currentYear}`);

        // Verarbeite Mitglied mit allen seinen Flügen
        return await processMemberDataWithAllFlights(member, currentYear, currentYearFlights);

      } catch (error) {
        console.error(`Fehler bei Mitglied ${member.name}:`, error);
        return null;
      }
    });

    const processedMembers = await Promise.all(memberPromises);
    const validMembers = processedMembers.filter(member => member !== null);

    console.log(`${validMembers.length} Mitglieder erfolgreich verarbeitet`);

    // Berechne Gesamt-Statistiken mit ALLEN Flügen
    const totalStats = calculateClubStatistics(validMembers);
    console.log('📊 Club-Statistiken:', totalStats);

    return validMembers;

  } catch (error) {
    console.error('Fehler beim Abrufen der WeGlide-Daten:', error);
    return [];
  }
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

/**
 * Verarbeitet die Daten eines einzelnen Mitglieds mit allen seinen Flügen
 * ANGEPASST: Nutzt neue Badge-Berechnung durch Subtraktion
 */
async function processMemberDataWithAllFlights(member, year, currentYearFlights) {
  if (!member || !member.id || !member.name) {
    console.error("Ungültiges Mitgliedsobjekt:", member);
    return null;
  }

  try {
    const userId = member.id;

    // 1. Lade zusätzliche historische Daten
    const previousYear = year - 1;
    const [previousYearFlights] = await Promise.all([
      apiClient.fetchUserFlights(userId, previousYear)
    ]);

    // Kombiniere alle Flüge (currentYearFlights sind bereits gefiltert)
    const allFlightsMap = new Map();

    // Füge gefilterte aktuelle Flüge hinzu
    currentYearFlights.forEach(flight => {
      if (flight && flight.id) {
        allFlightsMap.set(flight.id, flight);
      }
    });

    // Füge historische Flüge hinzu (diese brauchen wir für Pilotenfaktor)
    (previousYearFlights || []).forEach(flight => {
      if (flight && flight.id && !allFlightsMap.has(flight.id)) {
        allFlightsMap.set(flight.id, flight);
      }
    });

    // 2. FILTERE FLÜGE FÜR VERSCHIEDENE ZWECKE

    // Flüge für Ranking (aktuelles Jahr, ohne Fluglehrer, bereits ohne Co-Pilot)
    const rankingFlights = currentYearFlights
      .filter(flight => countsForScoring(flight, false))
      .map(flight => processFlightData(flight));

    // Alle Flüge für Statistiken (bereits gefiltert)
    const currentYearFlightsProcessed = currentYearFlights
      .map(flight => processFlightData(flight));

    // Historische Flüge für Pilotenfaktor
    const historicalFlightsProcessed = (previousYearFlights || [])
      .filter(flight => !checkIfPilotIsCoPilot(flight, userId)) // Auch hier Co-Pilot filtern
      .map(flight => processFlightData(flight));

    // 3. BERECHNE PILOTENFAKTOR
    let bestHistoricalDistance = 0;
    historicalFlightsProcessed.forEach(flight => {
      if (flight.km > bestHistoricalDistance) {
        bestHistoricalDistance = flight.km;
      }
    });
    const bestHistoricalFactor = calculatePilotFactor(bestHistoricalDistance);

    // 4. BERECHNE PUNKTE

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

    // 5. NEUE BADGE-BERECHNUNG DURCH SUBTRAKTION
    console.log(`  → Berechne Badges für ${member.name} mit Subtraktions-Methode...`);
    const badgeAnalysis = await calculateSeasonBadges(userId, member.name);

    // 6. LADE SPRINT-DATEN
    const sprintData = await apiClient.fetchSprintData(userId);

    // 7. ERSTELLE PILOT-OBJEKT
    return {
      name: member.name,
      userId: userId,
      totalPoints: totalPoints,
      flights: bestFlights,
      allFlights: currentYearFlightsProcessed,
      rankingFlights: rankingFlights,
      historicalFlights: historicalFlightsProcessed,
      sprintData: sprintData,
      pilotFactor: currentPilotFactor,
      historicalPilotFactor: bestHistoricalFactor,
      // Badge-Daten aus neuer Berechnung
      badges: badgeAnalysis.seasonBadges,                      // Alle Badge-Einträge der Saison
      badgeCount: badgeAnalysis.seasonBadgeCount,              // Anzahl Badge-Einträge in Saison 24/25
      badgeCategoryCount: badgeAnalysis.seasonBadgeTypeCount,  // Anzahl verschiedener Badge-Typen
      allTimeBadges: badgeAnalysis.allTimeBadges,              // Alle Badges (historisch)
      allTimeBadgeCount: badgeAnalysis.allTimeBadgeCount,      // Gesamt-Anzahl
      priorSeasonCount: badgeAnalysis.priorSeasonCount,        // Badges vor Saison
      badgeStats: badgeAnalysis.stats,                         // Detaillierte Statistiken
      // NEU: Flug-Statistiken hinzufügen
      flightsWithBadges: badgeAnalysis.flightsWithBadges || 0,
      flightsAnalyzed: badgeAnalysis.flightsAnalyzed || 0,
      // Zusätzliche Infos für UI
      firstTimeTypes: badgeAnalysis.stats.firstTimeTypes,      // Erstmalig erreichte Badge-Typen
      repeatedTypes: badgeAnalysis.stats.repeatedTypes,        // Wiederholte Badge-Typen
      multipleOccurrences: badgeAnalysis.stats.multipleOccurrences // Badges mit mehreren Einträgen
    };

  } catch (error) {
    console.error(`Fehler beim Verarbeiten von Mitglied ${member.name}:`, error);
    return {
      name: member.name,
      userId: member.id,
      totalPoints: 0,
      flights: [],
      allFlights: [],
      rankingFlights: [],
      historicalFlights: [],
      sprintData: [],
      pilotFactor: 4.0,
      historicalPilotFactor: 4.0,
      badges: [],
      badgeCount: 0,
      allTimeBadges: [],
      allTimeBadgeCount: 0,
      priorSeasonCount: 0,
      badgeCategoryCount: 0,
      badgeStats: null,
      newBadgeTypes: 0,
      badgeImprovements: 0,
      topImprovements: []
    };
  }
}

/**
 * Verarbeitet einzelne Flugdaten
 * @param {Object} flight - Rohe Flugdaten
 * @returns {Object} - Verarbeitete Flugdaten
 */
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

/**
 * Berechnet die Punkte für Flüge mit progressivem Pilotenfaktor
 * @param {Array} flights - Array mit Flügen
 * @param {string} pilotName - Name des Piloten
 * @param {Array} allFlights - ALLE Flüge des Piloten für progressive Berechnung
 */
export function calculateFlightPointsWithHistory(flights, pilotName, allFlights) {
  // Berechne progressive Pilotenfaktoren für ALLE Flüge
  const allFlightsWithFactors = calculateProgressivePilotFactors(allFlights);

  // Erstelle eine Map für schnellen Zugriff
  const flightFactorMap = new Map();
  allFlightsWithFactors.forEach(flight => {
    const key = `${flight.date}_${flight.km}`;
    flightFactorMap.set(key, flight.pilotFactor);
  });

  // Historischen Faktor aus der Konfiguration holen
  const configHistoricalFactor = HISTORICAL_PILOT_FACTORS[pilotName] || HISTORICAL_PILOT_FACTORS.DEFAULT;

  flights.forEach(flight => {
    // Finde den progressiven Faktor für diesen Flug
    const key = `${flight.date}_${flight.km}`;
    const progressiveFactor = flightFactorMap.get(key) || 4.0;

    // Den besseren (niedrigeren) Faktor verwenden
    const effectivePilotFactor = Math.min(progressiveFactor, configHistoricalFactor);

    // Flugzeugfaktor ermitteln
    const aircraft = AIRCRAFT_FACTORS[flight.aircraftType];
    //const aircraftFactor = aircraft ? aircraft.factor2 : 1.0;

    const aircraftFactor = getAircraftFactor(flight.aircraftType);

    // Punkte berechnen
    const points = flight.km * effectivePilotFactor * aircraftFactor * flight.takeoffFactor;

    flight.points = points;
    flight.pFactor = effectivePilotFactor;
    flight.pilotFactor = effectivePilotFactor;
    flight.flzFaktor = aircraftFactor;
    flight.aircraftFactor = aircraftFactor;

    console.log(`  ${flight.date}: ${flight.km.toFixed(1)} km × ${effectivePilotFactor} × ${aircraftFactor.toFixed(3)} × ${flight.takeoffFactor} = ${points.toFixed(2)} Punkte`);
  });
}

/**
 * Berechnet den Pilotenfaktor basierend auf der Distanz
 * @param {number} distance - Geflogene Distanz in km
 * @returns {number} - Pilotenfaktor
 */
export function calculatePilotFactor(distance) {
  for (const factor of PILOT_FACTORS) {
    if (distance <= factor.maxKm) {
      return factor.factor;
    }
  }
  return 1.0; // Fallback
}

/**
 * Ermittelt den Startplatzfaktor
 * @param {string} airfieldName - Name des Flugplatzes
 * @returns {number} - Startplatzfaktor
 */
function getAirfieldFactor(airfieldName) {
  return AIRFIELD_FACTORS[airfieldName] || AIRFIELD_FACTORS.DEFAULT;
}

/**
 * Prüft ob ein Flug für die Wertung zählt
 * @param {Object} flight - Flugdaten
 * @param {boolean} includeFlightsWithInstructor - Ob Flüge mit Fluglehrer zählen
 * @returns {boolean} - True wenn der Flug zählt
 */
export function countsForScoring(flight, includeFlightsWithInstructor = false) {
  if (!flight) return false;

  // Wenn Flüge mit Fluglehrer eingeschlossen werden sollen, zählt jeder Flug
  if (includeFlightsWithInstructor) {
    return true;
  }

  // Ansonsten prüfen ob ein Fluglehrer als Co-Pilot dabei war
  const coPilotName = getCoPliotName(flight);

  if (coPilotName && FLIGHT_INSTRUCTORS.includes(coPilotName)) {
    return false; // Flug mit Fluglehrer, zählt nicht für Ranking
  }

  return true;
}

/**
 * Extrahiert den Namen des Co-Piloten
 * @param {Object} flight - Flugdaten
 * @returns {string|null} - Name des Co-Piloten oder null
 */
export function getCoPliotName(flight) {
  if (!flight) return null;

  // Verschiedene Möglichkeiten für Co-Pilot-Daten
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

/**
 * Berechnet Statistiken aus allen Flügen
 * @param {Array} pilots - Array mit Pilotendaten
 * @returns {Object} - Statistiken
 */
export function calculateStats(pilots) {
  if (!Array.isArray(pilots)) {
    console.error("pilots ist kein Array:", pilots);
    return {
      totalPilots: 0,
      totalFlights: 0,
      totalKm: 0,
      longestFlight: 0,
      longestFlightPilot: '',
      maxWeGlidePoints: 0,
      maxWeGlidePointsPilot: ''
    };
  }

  let totalFlights = 0;
  let totalKm = 0;
  let longestFlight = 0;
  let longestFlightPilot = '';
  let maxWeGlidePoints = 0;
  let maxWeGlidePointsPilot = '';

  pilots.forEach(pilot => {
    if (!pilot) return;

    // Verwende ALLE Flüge für Statistiken
    const allFlights = pilot.allFlights || [];

    allFlights.forEach(flight => {
      if (!flight) return;

      totalFlights++;
      totalKm += flight.km || 0;

      // Längster Flug
      if ((flight.km || 0) > longestFlight) {
        longestFlight = flight.km || 0;
        longestFlightPilot = pilot.name;
      }

      // Max WeGlide Punkte
      if ((flight.originalPoints || 0) > maxWeGlidePoints) {
        maxWeGlidePoints = flight.originalPoints || 0;
        maxWeGlidePointsPilot = pilot.name;
      }
    });
  });

  return {
    totalPilots: pilots.length,
    totalFlights,
    totalKm,
    longestFlight,
    longestFlightPilot,
    maxWeGlidePoints,
    maxWeGlidePointsPilot
  };
}

/**
 * Berechnet den Pilotenfaktor progressiv basierend auf der bisherigen Bestleistung
 * @param {Array} allFlights - Alle Flüge des Piloten (sortiert nach Datum)
 * @returns {Array} - Flüge mit korrekten Pilotenfaktoren
 */
function calculateProgressivePilotFactors(allFlights) {
  if (!Array.isArray(allFlights) || allFlights.length === 0) return [];

  // Sortiere Flüge nach Datum (älteste zuerst)
  const sortedFlights = [...allFlights].sort((a, b) => {
    const dateA = new Date(a.date || a.scoring_date || 0);
    const dateB = new Date(b.date || b.scoring_date || 0);
    return dateA - dateB;
  });

  let currentBestDistance = 0;
  let currentPilotFactor = 4.0; // Start-Faktor für neue Piloten

  // Gehe durch jeden Flug chronologisch
  sortedFlights.forEach((flight, index) => {
    // Verwende den aktuellen Pilotenfaktor für diesen Flug
    flight.pilotFactor = currentPilotFactor;
    flight.pFactor = currentPilotFactor;

    // Aktualisiere die Bestleistung wenn dieser Flug länger war
    if (flight.km > currentBestDistance) {
      currentBestDistance = flight.km;
      // Berechne neuen Pilotenfaktor für ZUKÜNFTIGE Flüge
      currentPilotFactor = calculatePilotFactor(currentBestDistance);

      console.log(`  → Neue Bestleistung: ${flight.km.toFixed(1)} km am ${formatDateForDisplay(flight.date)}`);
      console.log(`    Neuer P-Faktor für folgende Flüge: ${currentPilotFactor}`);
    }

    // Debug-Info
    if (index < 5 || flight.km > 300) { // Zeige erste 5 Flüge oder große Flüge
      console.log(`    Flug ${index + 1}: ${flight.km.toFixed(1)} km - P-Faktor: ${flight.pilotFactor}`);
    }
  });

  return sortedFlights;
}

// Exports
export {
  formatISODateTime
};