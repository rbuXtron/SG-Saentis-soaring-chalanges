// /public/js/services/weglide-api-service.js
/**
 * SG Säntis Cup - WeGlide API Service
 * Version 2.0 - Mit optimiertem Club-Flüge Loading
 */

import { API_ENDPOINTS } from '../config/api-config.js';
import { API } from '../config/constants.js';

class WeGlideApiClient {
  constructor() {
    this._cache = {};
    this._activeRequests = new Map();
    this._clubFlightsCache = null;
    this._clubFlightsCacheTime = null;
  }

  _createCacheKey(endpoint, params) {
    return `${endpoint}?${new URLSearchParams(params).toString()}`;
  }

  _isCacheValid(cacheEntry, customExpiration = null) {
    if (!API.CACHE.ENABLED) return false;
    const now = new Date().getTime();
    const expirationTime = customExpiration || (API.CACHE.EXPIRATION_MINUTES * 60 * 1000);
    return (now - cacheEntry.timestamp) < expirationTime;
  }

  async fetchData(endpoint, params = {}, options = {}) {
    const cacheKey = this._createCacheKey(endpoint, params);

    // Cache-Prüfung
    if (this._cache[cacheKey] && this._isCacheValid(this._cache[cacheKey], options.cacheTime)) {
      console.log(`[API] Cache-Hit für: ${endpoint}`);
      return this._cache[cacheKey].data;
    }

    // Aktive Request-Prüfung
    if (this._activeRequests.has(cacheKey)) {
      console.log(`[API] Warte auf aktive Anfrage: ${endpoint}`);
      return this._activeRequests.get(cacheKey);
    }

    console.log(`[API] Neue Anfrage: ${endpoint}`);

    const requestPromise = new Promise(async (resolve, reject) => {
      try {
        const queryString = new URLSearchParams(params).toString();
        const url = `${endpoint}${queryString ? '?' + queryString : ''}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          ...options
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Cache speichern
        if (API.CACHE.ENABLED) {
          this._cache[cacheKey] = {
            data,
            timestamp: new Date().getTime()
          };
        }

        resolve(data);
      } catch (error) {
        console.error(`[API] Fehler bei ${endpoint}:`, error);
        reject(error);
      } finally {
        this._activeRequests.delete(cacheKey);
      }
    });

    this._activeRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  // Club-Daten
  async fetchClubData() {
    return this.fetchData('/api/weglide', {}, {
      cacheTime: 60 * 60 * 1000 // 1 Stunde
    });
  }

  // In weglide-api-service.js - Ersetzen Sie die fetchAllClubFlights Methode:

  async fetchAllClubFlights(startDate = '2023-06-01', forceRefresh = false) {
    // Spezial-Cache für Club-Flüge (30 Minuten)
    const cacheValid = this._clubFlightsCacheTime &&
      (Date.now() - this._clubFlightsCacheTime) < (30 * 60 * 1000);

    if (!forceRefresh && cacheValid && this._clubFlightsCache) {
      console.log('[API] Verwende Cache für Club-Flüge');
      return this._clubFlightsCache;
    }

    console.log('[API] Lade alle Club-Flüge neu...');

    try {
      // Schritt 1: Lade Club-Daten über den FUNKTIONIERENDEN Proxy
      const clubData = await this.fetchData('/api/proxy', {
        endpoint: 'weglide'  // Verwendet den Legacy endpoint der funktioniert!
      });

      if (!clubData || !clubData.user || !Array.isArray(clubData.user)) {
        throw new Error('Keine Club-Mitglieder gefunden');
      }

      const members = clubData.user;
      console.log(`[API] ${members.length} Mitglieder gefunden`);

      // Schritt 2: Lade Flüge für alle Mitglieder
      const allFlights = [];
      const currentYear = new Date().getFullYear();
      const seasons = [currentYear, currentYear - 1, currentYear - 2]; // 3 Jahre Historie

      // Sequenziell laden um API nicht zu überlasten
      for (const member of members) {
        console.log(`[API] Lade Flüge für ${member.name}...`);

        for (const season of seasons) {
          try {
            // Verwende den FUNKTIONIERENDEN path Parameter
            const seasonFlights = await this.fetchData('/api/proxy', {
              path: 'flights',
              user_id_in: member.id,
              season_in: season,
              limit: 100
            });

            if (Array.isArray(seasonFlights)) {
              // Füge User-Info zu jedem Flug hinzu
              seasonFlights.forEach(flight => {
                flight.user = member;
              });
              allFlights.push(...seasonFlights);
            }
          } catch (error) {
            console.warn(`[API] Fehler beim Laden der Flüge für ${member.name} (${season}):`, error.message);
          }
        }

        // Kleine Pause zwischen Usern um API nicht zu überlasten
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Sortiere nach Datum (neueste zuerst)
      allFlights.sort((a, b) => {
        const dateA = new Date(a.scoring_date || a.takeoff_time);
        const dateB = new Date(b.scoring_date || b.takeoff_time);
        return dateB - dateA;
      });

      console.log(`[API] ✅ ${allFlights.length} Flüge geladen`);

      // Berechne Metadaten
      const flightDates = allFlights.map(f => new Date(f.scoring_date || f.takeoff_time));
      const oldestFlight = flightDates.length > 0 ? new Date(Math.min(...flightDates)) : new Date();
      const newestFlight = flightDates.length > 0 ? new Date(Math.max(...flightDates)) : new Date();

      // Erstelle Response im erwarteten Format
      const response = {
        flights: allFlights,
        metadata: {
          memberCount: members.length,
          flightCount: allFlights.length,
          dateRange: {
            from: oldestFlight.toISOString().split('T')[0],
            to: newestFlight.toISOString().split('T')[0],
            oldestFlight: oldestFlight.toISOString().split('T')[0],
            newestFlight: newestFlight.toISOString().split('T')[0]
          }
        },
        members: members
      };

      // Cache aktualisieren
      this._clubFlightsCache = response;
      this._clubFlightsCacheTime = Date.now();

      return response;
    } catch (error) {
      console.error('[API] Fehler beim Laden der Club-Flüge:', error);

      // Fallback auf Cache wenn verfügbar
      if (this._clubFlightsCache) {
        console.warn('[API] Verwende veralteten Cache als Fallback');
        return this._clubFlightsCache;
      }
      throw error;
    }
  }

  // User-Flüge (jetzt aus Club-Flüge-Cache)
  async fetchUserFlights(userId, year) {
    // Wenn Club-Flüge gecacht sind, daraus filtern
    if (this._clubFlightsCache && this._clubFlightsCache.flights) {
      console.log(`[API] Filtere User ${userId} Flüge aus Cache`);

      const userFlights = this._clubFlightsCache.flights.filter(flight => {
        const flightYear = new Date(flight.scoring_date || flight.takeoff_time).getFullYear();
        return flight.user?.id === userId && flightYear === year;
      });

      return userFlights;
    }

    // Fallback auf einzelne API-Anfrage
    console.log(`[API] Lade User ${userId} Flüge via API`);
    return this.fetchData('/api/flights', {
      user_id_in: userId,
      season_in: year,
      limit: API.PAGINATION.DEFAULT_LIMIT
    });
  }

  // Sprint-Daten
  async fetchSprintData(userId) {
    return this.fetchData('/api/sprint', {
      user_id_in: userId,
      limit: API.PAGINATION.DEFAULT_LIMIT
    });
  }

  // Achievements
  async fetchUserAchievements(userId) {
    return this.fetchData(`/api/achievements/${userId}`, {}, {
      cacheTime: 2 * 60 * 60 * 1000 // 2 Stunden
    });
  }

  // In der fetchFlightDetails Methode:
  async fetchFlightDetails(flightId) {
    // WICHTIG: Verwende /api/flightdetail/ (nicht /api/flight/)
    return this.fetchData(`/api/flightdetail/${flightId}`, {}, {
      cacheTime: 24 * 60 * 60 * 1000 // 24 Stunden
    });
  }

  // Cache leeren
  clearCache() {
    this._cache = {};
    this._clubFlightsCache = null;
    this._clubFlightsCacheTime = null;
    console.log("[API] Cache vollständig geleert");
  }

  // Nur Club-Flüge-Cache leeren
  clearClubFlightsCache() {
    this._clubFlightsCache = null;
    this._clubFlightsCacheTime = null;
    console.log("[API] Club-Flüge-Cache geleert");
  }
  // In deiner weglide-api-service.js
  async fetchUserDetails(userId) {
    return this.fetchData(`/api/user/${userId}`, {}, {
      cacheTime: 5 * 60 * 1000 // 5 Minuten
    });
  }
  // Flug-Details mit korrektem Endpunkt
  async fetchFlightDetails(flightId) {
    return this.fetchData(`/api/flightdetail/${flightId}`, {}, {
      cacheTime: 24 * 60 * 60 * 1000 // 24 Stunden Cache
    });
  }

  // Cache-Statistiken
  getCacheStats() {
    const cacheEntries = Object.keys(this._cache).length;
    const clubFlightsCached = !!this._clubFlightsCache;
    const clubFlightsAge = this._clubFlightsCacheTime
      ? Math.floor((Date.now() - this._clubFlightsCacheTime) / 1000 / 60)
      : null;

    return {
      entries: cacheEntries,
      clubFlightsCached,
      clubFlightsAge: clubFlightsAge ? `${clubFlightsAge} Minuten` : 'Nicht gecacht'
    };
  }
}

export const apiClient = new WeGlideApiClient();