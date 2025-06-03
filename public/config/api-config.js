// In public/js/config/api-config.js
const IS_DEVELOPMENT = false;

const isLocalhost = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';
                    
const isDevelopment = IS_DEVELOPMENT || isLocalhost;

// Verwende die Serverless Function
const baseApiUrl = '/api/proxy';

export const API_ENDPOINTS = {
  CLUB_DATA: baseApiUrl,
  USER_FLIGHTS: baseApiUrl,
  SEASON_FLIGHTS: baseApiUrl,
  SPRINT_DATA: baseApiUrl,
  ACHIEVEMENTS: baseApiUrl,
  FLIGHT_DETAIL: baseApiUrl,
  PILOT_FLIGHTS: baseApiUrl,
  
  IS_DEVELOPMENT: isDevelopment,
  BASE_URL: baseApiUrl
};