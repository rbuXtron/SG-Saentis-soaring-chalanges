/**
 * SG Säntis Cup - API Konfiguration
 * Vercel nutzt IMMER den Proxy!
 */

// Vercel Deployment erkennen
const isVercel = window.location.hostname.includes('vercel.app');
const isLocalhost = window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1';

// Basis-URL - IMMER Proxy verwenden!
const baseApiUrl = '/api';  // Vercel API Routes

export const API_ENDPOINTS = {
  // IMMER Proxy-Endpoints verwenden
  CLUB_DATA: `${baseApiUrl}/weglide`,
  USER_FLIGHTS: `${baseApiUrl}/flights`,
  SEASON_FLIGHTS: `${baseApiUrl}/season_flights`,
  SPRINT_DATA: `${baseApiUrl}/sprint`,
  ACHIEVEMENTS: `${baseApiUrl}/achievements`,
  FLIGHT_DETAIL: `${baseApiUrl}/flightdetail`,
  PILOT_FLIGHTS: `${baseApiUrl}/pilot-flights`,
  
  // Metadaten
  IS_DEVELOPMENT: isLocalhost,
  IS_VERCEL: isVercel,
  BASE_URL: baseApiUrl
};

console.log('API-Konfiguration:', {
  hostname: window.location.hostname,
  isVercel,
  isLocalhost,
  endpoints: API_ENDPOINTS
});