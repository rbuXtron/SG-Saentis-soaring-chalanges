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

  // In public/js/services/weglide-api-service.js

async fetchClubData() {
  return this.fetchData(API_ENDPOINTS.CLUB_DATA, {
    endpoint: 'weglide'
  });
}

async fetchUserFlights(userId, year) {
  return this.fetchData(API_ENDPOINTS.USER_FLIGHTS, {
    endpoint: 'flights',
    user_id_in: userId,
    season_in: year,
    limit: API.PAGINATION.DEFAULT_LIMIT,
    order_by: '-scoring_date'
  });
}

async fetchSprintData(userId) {
  return this.fetchData(API_ENDPOINTS.SPRINT_DATA, {
    endpoint: 'sprint',
    user_id_in: userId,
    limit: API.PAGINATION.DEFAULT_LIMIT,
    order_by: '-created'
  });
}

async fetchUserAchievements(userId) {
  return this.fetchData(API_ENDPOINTS.ACHIEVEMENTS, {
    endpoint: 'achievements',
    userId: userId
  });
}

async fetchFlightDetails(flightId) {
  return this.fetchData(API_ENDPOINTS.FLIGHT_DETAIL, {
    endpoint: 'flightdetail',
    flightId: flightId
  });
}

  clearCache() {
    this._cache = {};
    console.log("[API] Cache wurde gelöscht");
  }
}

export const apiClient = new WeGlideApiClient();