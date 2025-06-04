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

  // In weglide-api-service.js - Überprüfen/Korrigieren Sie die fetchData Methode:

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

    console.log(`[API] Neue Anfrage: ${endpoint} mit params:`, params);

    const requestPromise = new Promise(async (resolve, reject) => {
      try {
        const queryString = new URLSearchParams(params).toString();
        const url = `${endpoint}${queryString ? '?' + queryString : ''}`;

        console.log(`[API] Fetching URL: ${url}`); // Debug

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

  // Club-Daten - KORRIGIERT
  async fetchClubData() {
    // WICHTIG: Kein führender Slash wenn wir relative URLs verwenden!
    return this.fetchData('/api/proxy', {
      endpoint: 'weglide'  // Nutzt den funktionierenden Legacy-Endpoint
    }, {
      cacheTime: 60 * 60 * 1000 // 1 Stunde
    });
  }
  // In weglide-api-service.js - Ersetzen Sie die fetchAllClubFlights Methode:

  // In weglide-api-service.js - Korrigieren Sie die fetchAllClubFlights Methode:

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
      // Schritt 1: Lade Club-Daten
      console.log('[API] Schritt 1: Lade Club-Daten...');
      const clubData = await this.fetchClubData();

      if (!clubData || !clubData.user || !Array.isArray(clubData.user)) {
        console.error('[API] Ungültige Club-Daten:', clubData);
        throw new Error('Keine Club-Mitglieder gefunden');
      }

      const members = clubData.user;
      console.log(`[API] ${members.length} Mitglieder gefunden`);

      // Schritt 2: Lade Flüge für alle Mitglieder
      const allFlights = [];
      const currentYear = new Date().getFullYear();

      // Lade nur die letzten 2 Jahre für Performance
      const seasons = [currentYear, currentYear - 1];

      // Progress tracking
      let processedMembers = 0;

      for (const member of members) {
        for (const season of seasons) {
          try {
            // WICHTIG: Nutze die existierende fetchUserFlights Methode!
            const seasonFlights = await this.fetchUserFlights(member.id, season);

            if (Array.isArray(seasonFlights) && seasonFlights.length > 0) {
              // User-Info ist bereits in den Flügen wenn wir fetchUserFlights nutzen
              allFlights.push(...seasonFlights);
              console.log(`[API] ${member.name}: ${seasonFlights.length} Flüge in ${season}`);
            }
          } catch (error) {
            console.warn(`[API] Fehler beim Laden für ${member.name} (${season}):`, error.message);
          }
        }

        processedMembers++;
        if (processedMembers % 5 === 0) {
          console.log(`[API] Fortschritt: ${processedMembers}/${members.length} Mitglieder`);
        }

        // Kleine Pause zwischen Usern
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log(`[API] ✅ ${allFlights.length} Flüge geladen`);

      // Sortiere nach Datum (neueste zuerst)
      allFlights.sort((a, b) => {
        const dateA = new Date(a.scoring_date || a.takeoff_time);
        const dateB = new Date(b.scoring_date || b.takeoff_time);
        return dateB - dateA;
      });

      // Berechne Metadaten
      let oldestDate = new Date();
      let newestDate = new Date(0);

      allFlights.forEach(flight => {
        const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
        if (flightDate < oldestDate) oldestDate = flightDate;
        if (flightDate > newestDate) newestDate = flightDate;
      });

      // Erstelle Response
      const response = {
        flights: allFlights,
        metadata: {
          memberCount: members.length,
          flightCount: allFlights.length,
          dateRange: {
            from: oldestDate.toISOString().split('T')[0],
            to: newestDate.toISOString().split('T')[0],
            oldestFlight: oldestDate.toISOString().split('T')[0],
            newestFlight: newestDate.toISOString().split('T')[0]
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

      // Fallback auf Cache
      if (this._clubFlightsCache) {
        console.warn('[API] Verwende veralteten Cache als Fallback');
        return this._clubFlightsCache;
      }

      // Fallback auf leere Response
      return {
        flights: [],
        metadata: {
          memberCount: 0,
          flightCount: 0,
          dateRange: {}
        },
        members: []
      };
    }
  }

  // Stelle sicher, dass fetchUserFlights korrekt implementiert ist:
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
    console.log(`[API] Lade User ${userId} Flüge für ${year} via API`);

    // VERWENDE DIE KORREKTE API STRUKTUR
    try {
      // Für die WeGlide API müssen wir einen anderen Ansatz verwenden
      // Da der direkte flights endpoint nicht über unseren Proxy funktioniert,
      // nutzen wir einen anderen Weg:

      // Option 1: Verwende den Sprint-Endpunkt (falls verfügbar)
      const sprintData = await this.fetchData('/api/proxy', {
        path: 'sprint',
        user_id_in: userId,
        limit: 100
      });

      if (Array.isArray(sprintData)) {
        // Filtere nach Jahr
        return sprintData.filter(flight => {
          const flightYear = new Date(flight.scoring_date || flight.takeoff_time).getFullYear();
          return flightYear === year;
        });
      }

      return [];
    } catch (error) {
      console.warn(`[API] Fehler beim Laden der User-Flüge:`, error.message);
      return [];
    }
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