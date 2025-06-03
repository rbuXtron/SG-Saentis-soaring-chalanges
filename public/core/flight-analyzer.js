/**
 * SG Säntis Cup - Fluganalyse
 * 
 * Kernfunktionen zur Analyse von Flügen
 */

import { FLIGHT_INSTRUCTORS } from '../config/constants.js';

/**
 * Prüft ob ein Flug für die Wertung zählt
 * @param {Object} flight - Flugdaten
 * @param {boolean} includeFlightsWithInstructor - Ob Flüge mit Fluglehrer zählen
 * @returns {boolean} - True wenn der Flug zählt
 */
export function countsForScoring(flight, includeFlightsWithInstructor = false) {
  if (!flight) return false;

  if (includeFlightsWithInstructor) {
    return true;
  }

  const coPilotName = getCoPilotName(flight);
  if (coPilotName && FLIGHT_INSTRUCTORS.includes(coPilotName)) {
    return false;
  }

  return true;
}

/**
 * Extrahiert den Namen des Co-Piloten
 * @param {Object} flight - Flugdaten
 * @returns {string|null} - Name des Co-Piloten oder null
 */
export function getCoPilotName(flight) {
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

/**
 * Prüft ob ein User Co-Pilot in einem Flug ist
 * @param {Object} flight - Flugdaten
 * @param {number} userId - User ID
 * @returns {boolean} - True wenn User Co-Pilot ist
 */
export function checkIfPilotIsCoPilot(flight, userId) {
  if (!flight) return false;

  const coPilotData = flight.co_user || flight.co_pilot || flight.copilot;
  if (!coPilotData) return false;

  if (typeof coPilotData === 'object') {
    if (coPilotData.id && coPilotData.id === userId) {
      return true;
    }
  } else if (typeof coPilotData === 'number' || typeof coPilotData === 'string') {
    if (parseInt(coPilotData) === parseInt(userId)) {
      return true;
    }
  }

  if (flight.co_user_id && parseInt(flight.co_user_id) === parseInt(userId)) {
    return true;
  }

  return false;
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
  const coPilotName = getCoPilotName(flight);

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
 * Ermittelt den Startplatzfaktor
 * @param {string} airfieldName - Name des Flugplatzes
 * @returns {number} - Startplatzfaktor
 */
function getAirfieldFactor(airfieldName) {
  return AIRFIELD_FACTORS[airfieldName] || AIRFIELD_FACTORS.DEFAULT;
}