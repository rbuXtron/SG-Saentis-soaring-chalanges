/**
 * SG Säntis Cup - API Konfiguration
 * 
 * Konfiguriert die API-Endpunkte basierend auf der aktuellen Umgebung
 * (Entwicklung mit Proxy oder Produktion direkt zu WeGlide)
 */

// Manuelles Flag für Entwicklungsumgebung
// In Produktion auf false setzen oder
// diese Variable dynamisch durch ein Build-Tool ersetzen lassen
const IS_DEVELOPMENT = false;

// Bestimme automatisch, ob wir auf localhost sind
const isLocalhost = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname.includes('.local');
                    
// Kombiniertes Flag (entweder manuell gesetzt oder auf localhost)
const isDevelopment = IS_DEVELOPMENT || isLocalhost;

// Basis-URL je nach Umgebung
const baseApiUrl = isDevelopment 
  ? '/api'  // Lokaler Proxy während der Entwicklung
  : '/api'; // Auch in Produktion über Vercel Rewrites

export const API_ENDPOINTS = {
  // Stellt die korrekten Endpunkte für die aktuelle Umgebung bereit
  CLUB_DATA: `${baseApiUrl}/weglide`, 
  USER_FLIGHTS: `${baseApiUrl}/flights`,
  SEASON_FLIGHTS: `${baseApiUrl}/season_flights`,
  SPRINT_DATA: `${baseApiUrl}/sprint`,
  ACHIEVEMENTS: `${baseApiUrl}/achievements`,
  FLIGHT_DETAIL: `${baseApiUrl}/flightdetail`,
  PILOT_FLIGHTS: `${baseApiUrl}/pilot-flights`,
  
  // Zusätzliche Metadaten
  IS_DEVELOPMENT: isDevelopment,
  BASE_URL: baseApiUrl
};

// Logging der API-Konfiguration nur in der Entwicklung 
if (isDevelopment) {
  console.log('API-Konfiguration:', {
    isDevelopment,
    isLocalhost,
    baseApiUrl,
    endpoints: API_ENDPOINTS
  });
}

// Export für Tests und Debugging
export function getApiConfig() {
  return {
    environment: isDevelopment ? 'development' : 'production',
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    baseUrl: baseApiUrl,
    endpoints: API_ENDPOINTS
  };
}

// Hilfsfunktion zum Erstellen vollständiger URLs
export function buildApiUrl(endpoint, params = {}) {
  let url = endpoint;
  
  // Query-Parameter hinzufügen
  const queryParams = new URLSearchParams(params).toString();
  if (queryParams) {
    url += `?${queryParams}`;
  }
  
  return url;
}

// API Health Check
export async function checkApiHealth() {
  try {
    const response = await fetch(API_ENDPOINTS.CLUB_DATA);
    return {
      status: response.ok ? 'healthy' : 'unhealthy',
      statusCode: response.status,
      environment: isDevelopment ? 'development' : 'production'
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      environment: isDevelopment ? 'development' : 'production'
    };
  }
}