/**
 * SG Säntis Cup - WeGlide API Service
 * Nutzt IMMER Proxy-Routes (auch in Produktion)
 */

import { API_ENDPOINTS } from '../config/api-config.js';
import { API } from '../config/constants.js';

class WeGlideApiClient {
  constructor() {
    this._cache = {};
    this._activeRequests = new Map();
  }

  _createCacheKey(endpoint, params) {
    return `${endpoint}?${new URLSearchParams(params).toString()}`;
  }

  _isCacheValid(cacheEntry) {
    if (!API.CACHE.ENABLED) return false;
    const now = new Date().getTime();
    const expirationTime = API.CACHE.EXPIRATION_MINUTES * 60 * 1000;
    return (now - cacheEntry.timestamp) < expirationTime;
  }

  async fetchData(endpoint, params = {}, options = {}) {
    const cacheKey = this._createCacheKey(endpoint, params);

    if (this._cache[cacheKey] && this._isCacheValid(this._cache[cacheKey])) {
      console.log(`[API] Verwende Cache für: ${cacheKey}`);
      return this._cache[cacheKey].data;
    }

    if (this._activeRequests.has(cacheKey)) {
      console.log(`[API] Bereits aktive Anfrage für: ${cacheKey}`);
      return this._activeRequests.get(cacheKey);
    }

    console.log(`[API] Starte neue Anfrage für: ${endpoint}`);

    const requestPromise = new Promise(async (resolve, reject) => {
      try {
        const queryString = new URLSearchParams(params).toString();
        const url = `${endpoint}${queryString ? '?' + queryString : ''}`;
        console.log(`[API] Anfrage-URL: ${url}`);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          ...options
        });

        if (!response.ok) {
          throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }

        const data = await response.json();

        if (API.CACHE.ENABLED) {
          this._cache[cacheKey] = {
            data,
            timestamp: new Date().getTime()
          };
        }

        resolve(data);
      } catch (error) {
        console.error(`[API] Fehler bei Anfrage ${endpoint}:`, error);
        resolve([]); // Leeres Array im Fehlerfall
      } finally {
        this._activeRequests.delete(cacheKey);
      }
    });

    this._activeRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  // VEREINFACHTE Methoden - nutzen IMMER Proxy
  async fetchClubData() {
  // Keine zusätzlichen Parameter nötig, da contest=free in vercel.json definiert ist
  return this.fetchData(API_ENDPOINTS.CLUB_DATA, {}, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
}

  async fetchClubFlights(year = new Date().getFullYear(), limit = 100) {
    return this.fetchData(API_ENDPOINTS.SEASON_FLIGHTS, {
      season_in: year
    });
  }

  async fetchUserFlights(userId, year) {
    return this.fetchData(API_ENDPOINTS.USER_FLIGHTS, {
      user_id_in: userId,
      season_in: year,
      limit: API.PAGINATION.DEFAULT_LIMIT
    });
  }

  async fetchSprintData(userId) {
    return this.fetchData(API_ENDPOINTS.SPRINT_DATA, {
      user_id_in: userId,
      limit: API.PAGINATION.DEFAULT_LIMIT
    });
  }

  async fetchUserAchievements(userId) {
    if (!userId) {
      console.warn('[API] Keine User-ID für Achievements angegeben');
      return [];
    }
    
    console.log(`[API] Lade Achievements für User ${userId}`);
    
    try {
      const data = await this.fetchData(`${API_ENDPOINTS.ACHIEVEMENTS}/${userId}`);
      return data || [];
    } catch (error) {
      console.error(`[API] Fehler beim Laden der Achievements für User ${userId}:`, error);
      return [];
    }
  }

  async fetchFlightDetails(flightId) {
    if (!flightId) {
      console.warn('[API] Keine Flug-ID angegeben');
      return null;
    }
    return this.fetchData(`${API_ENDPOINTS.FLIGHT_DETAIL}/${flightId}`);
  }

  clearCache() {
    this._cache = {};
    console.log("[API] Cache wurde gelöscht");
  }
}

export const apiClient = new WeGlideApiClient();