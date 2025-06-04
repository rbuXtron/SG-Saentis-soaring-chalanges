// /public/js/services/weglide-api-service.js
/**
 * SG Säntis Cup - WeGlide API Service
 * Version 2.1 - Mit optimiertem Club-Flüge Loading und Trennung von Season/Historischen Flügen
 * 
 * WICHTIG: Saison läuft vom 1. Oktober bis 30. September
 * Aktuelle Saison 2024/2025: 01.10.2024 - 30.09.2025
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

  /**
   * Hilfsfunktion: Bestimmt die Saison für ein Datum
   * Saison läuft vom 1. Oktober bis 30. September
   * @param {Date|string} date - Datum
   * @returns {string} - Saison im Format "2024/2025"
   */
  getSeasonForDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1; // JavaScript months are 0-based
    
    // Oktober bis Dezember: Saison beginnt in diesem Jahr
    if (month >= 10) {
      return `${year}/${year + 1}`;
    }
    // Januar bis September: Saison begann im Vorjahr
    else {
      return `${year - 1}/${year}`;
    }
  }

  /**
   * Bestimmt Start- und Enddatum einer Saison
   * @param {string} season - Saison im Format "2024/2025"
   * @returns {Object} - { start: Date, end: Date }
   */
  getSeasonDates(season) {
    const [startYear, endYear] = season.split('/').map(y => parseInt(y));
    return {
      start: new Date(startYear, 9, 1), // 1. Oktober (Monat 9 = Oktober)
      end: new Date(endYear, 8, 30, 23, 59, 59) // 30. September (Monat 8 = September)
    };
  }

  /**
   * Prüft ob ein Datum in der aktuellen Saison liegt
   * @param {Date|string} date - Zu prüfendes Datum
   * @returns {boolean}
   */
  isCurrentSeason(date) {
    const d = new Date(date);
    const now = new Date();
    const currentSeason = this.getSeasonForDate(now);
    const dateSeason = this.getSeasonForDate(d);
    return currentSeason === dateSeason;
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

    console.log(`[API] Neue Anfrage: ${endpoint} mit params:`, params);

    const requestPromise = new Promise(async (resolve, reject) => {
      try {
        const queryString = new URLSearchParams(params).toString();
        const url = `${endpoint}${queryString ? '?' + queryString : ''}`;
        
        console.log(`[API] Fetching URL: ${url}`);

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
    return this.fetchData('/api/proxy', {
      endpoint: 'weglide'
    }, {
      cacheTime: 60 * 60 * 1000 // 1 Stunde
    });
  }

  // NEUE METHODE: Alle Club-Flüge laden mit Trennung Season/Historical
  async fetchAllClubFlights(startDate = '2023-06-01', forceRefresh = false) {
    // Spezial-Cache für Club-Flüge (30 Minuten)
    const cacheValid = this._clubFlightsCacheTime &&
      (Date.now() - this._clubFlightsCacheTime) < (30 * 60 * 1000);

    if (!forceRefresh && cacheValid && this._clubFlightsCache) {
      console.log('[API] Verwende Cache für Club-Flüge');
      return this._clubFlightsCache;
    }

    console.log('[API] Lade alle Club-Flüge neu (getrennt nach Season/Historical)...');

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

      // Schritt 2: Bestimme aktuelle Saison
      const currentSeason = this.getSeasonForDate(new Date());
      const currentSeasonDates = this.getSeasonDates(currentSeason);
      
      console.log(`[API] Aktuelle Saison: ${currentSeason}`);
      console.log(`[API] Saison-Zeitraum: ${currentSeasonDates.start.toLocaleDateString()} - ${currentSeasonDates.end.toLocaleDateString()}`);

      // Strukturierte Datensammlung
      const flightsByPeriod = {
        currentSeason: [],    // Aktuelle Saison (z.B. 2024/2025)
        historical: []        // Historische Flüge
      };
      
      // Progress tracking
      let processedMembers = 0;
      
      // Batch-Verarbeitung für bessere Performance
      const batchSize = 5;
      
      for (let i = 0; i < members.length; i += batchSize) {
        const batch = members.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (member) => {
          const userFlights = [];
          
          // Lade Flüge für die letzten 3 Jahre
          const currentYear = new Date().getFullYear();
          const yearsToLoad = [currentYear, currentYear - 1, currentYear - 2];
          
          for (const year of yearsToLoad) {
            try {
              const yearFlights = await this.fetchUserFlights(member.id, year);
              
              if (Array.isArray(yearFlights) && yearFlights.length > 0) {
                // Füge User-Info zu jedem Flug hinzu
                yearFlights.forEach(flight => {
                  flight.user = {
                    id: member.id,
                    name: member.name
                  };
                });
                userFlights.push(...yearFlights);
                console.log(`[API] ${member.name}: ${yearFlights.length} Flüge in ${year}`);
              }
            } catch (error) {
              console.warn(`[API] Fehler beim Laden der Flüge ${year} für ${member.name}:`, error.message);
            }
          }
          
          // Zusätzlich: Lade Flüge aus 2023 wenn nötig (für Badge-Historie)
          if (!yearsToLoad.includes(2023)) {
            try {
              const flights2023 = await this.fetchUserFlights(member.id, 2023);
              if (Array.isArray(flights2023) && flights2023.length > 0) {
                flights2023.forEach(flight => {
                  flight.user = { id: member.id, name: member.name };
                });
                userFlights.push(...flights2023);
                console.log(`[API] ${member.name}: ${flights2023.length} Flüge in 2023 (für Badge-Historie)`);
              }
            } catch (error) {
              console.warn(`[API] Fehler beim Laden der 2023-Flüge für ${member.name}:`, error.message);
            }
          }
          
          return userFlights;
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Sortiere Flüge in aktuelle Saison und historisch
        batchResults.forEach(userFlights => {
          userFlights.forEach(flight => {
            const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
            
            if (this.isCurrentSeason(flightDate)) {
              flightsByPeriod.currentSeason.push(flight);
            } else {
              flightsByPeriod.historical.push(flight);
            }
          });
        });
        
        processedMembers += batch.length;
        console.log(`[API] Fortschritt: ${processedMembers}/${members.length} Mitglieder`);
      }

      // Sortiere beide Arrays nach Datum (neueste zuerst)
      flightsByPeriod.currentSeason.sort((a, b) => {
        const dateA = new Date(a.scoring_date || a.takeoff_time);
        const dateB = new Date(b.scoring_date || b.takeoff_time);
        return dateB - dateA;
      });
      
      flightsByPeriod.historical.sort((a, b) => {
        const dateA = new Date(a.scoring_date || a.takeoff_time);
        const dateB = new Date(b.scoring_date || b.takeoff_time);
        return dateB - dateA;
      });

      console.log(`[API] ✅ Flüge geladen:`);
      console.log(`[API]   → ${flightsByPeriod.currentSeason.length} Flüge in aktueller Saison ${currentSeason}`);
      console.log(`[API]   → ${flightsByPeriod.historical.length} historische Flüge`);

      // Berechne detaillierte Saison-Statistiken
      const seasonStats = {};
      [...flightsByPeriod.currentSeason, ...flightsByPeriod.historical].forEach(flight => {
        const season = this.getSeasonForDate(flight.scoring_date || flight.takeoff_time);
        seasonStats[season] = (seasonStats[season] || 0) + 1;
      });

      console.log(`[API] Flüge nach Saison:`);
      Object.entries(seasonStats)
        .sort(([a], [b]) => b.localeCompare(a))
        .forEach(([season, count]) => {
          console.log(`[API]   → ${season}: ${count} Flüge`);
        });

      // Berechne Metadaten
      let oldestDate = new Date();
      let newestDate = new Date(0);
      
      [...flightsByPeriod.currentSeason, ...flightsByPeriod.historical].forEach(flight => {
        const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
        if (flightDate < oldestDate) oldestDate = flightDate;
        if (flightDate > newestDate) newestDate = flightDate;
      });

      // Erstelle Response mit getrennten Flügen
      const response = {
        // Für Abwärtskompatibilität
        flights: [...flightsByPeriod.currentSeason, ...flightsByPeriod.historical],
        
        // NEU: Getrennte Arrays nach Saison
        currentSeasonFlights: flightsByPeriod.currentSeason,
        historicalFlights: flightsByPeriod.historical,
        
        metadata: {
          memberCount: members.length,
          currentSeason: currentSeason,
          currentSeasonStart: currentSeasonDates.start.toISOString(),
          currentSeasonEnd: currentSeasonDates.end.toISOString(),
          currentSeasonCount: flightsByPeriod.currentSeason.length,
          historicalCount: flightsByPeriod.historical.length,
          totalCount: flightsByPeriod.currentSeason.length + flightsByPeriod.historical.length,
          dateRange: {
            from: oldestDate.toISOString().split('T')[0],
            to: newestDate.toISOString().split('T')[0],
            oldestFlight: oldestDate.toISOString().split('T')[0],
            newestFlight: newestDate.toISOString().split('T')[0]
          },
          seasonBreakdown: seasonStats
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
        currentSeasonFlights: [],
        historicalFlights: [],
        metadata: {
          memberCount: 0,
          currentSeason: this.getSeasonForDate(new Date()),
          currentSeasonCount: 0,
          historicalCount: 0,
          totalCount: 0,
          dateRange: {},
          seasonBreakdown: {}
        },
        members: []
      };
    }
  }

  // User-Flüge - Verwende 'flight' statt 'flights'
  async fetchUserFlights(userId, year) {
    // Wenn Club-Flüge gecacht sind, daraus filtern
    if (this._clubFlightsCache) {
      console.log(`[API] Prüfe Cache für User ${userId} Flüge...`);

      const targetSeason = `${year - 1}/${year}`; // z.B. "2024/2025" für year=2025
      const currentSeason = this.getSeasonForDate(new Date());
      let userFlights = [];

      if (targetSeason === currentSeason && this._clubFlightsCache.currentSeasonFlights) {
        // Aktuelle Saison aus getrenntem Array
        userFlights = this._clubFlightsCache.currentSeasonFlights.filter(flight => 
          flight.user?.id === userId
        );
      } else if (this._clubFlightsCache.historicalFlights) {
        // Historische Flüge - filtere nach Saison
        userFlights = this._clubFlightsCache.historicalFlights.filter(flight => {
          const flightSeason = this.getSeasonForDate(flight.scoring_date || flight.takeoff_time);
          return flight.user?.id === userId && flightSeason === targetSeason;
        });
      }

      if (userFlights.length > 0) {
        console.log(`[API] ${userFlights.length} Flüge für User ${userId} aus Cache gefunden`);
        return userFlights;
      }
    }

    // Fallback auf einzelne API-Anfrage
    console.log(`[API] Lade User ${userId} Flüge für ${year} via API`);
    
    try {
      // Verwende 'flight' Endpunkt (SINGULAR!)
      const flights = await this.fetchData('/api/proxy', {
        path: 'flight',
        user_id_in: userId,
        season_in: year,
        limit: 100
      });
      
      if (Array.isArray(flights)) {
        console.log(`[API] ${flights.length} Flüge für User ${userId} in ${year} geladen`);
        return flights;
      }
      
      return [];
    } catch (error) {
      console.error(`[API] Fehler beim Laden der User-Flüge:`, error);
      
      // Fallback: Versuche es mit date range
      try {
        const dateFrom = `${year}-01-01`;
        const dateTo = `${year}-12-31`;
        
        const flights = await this.fetchData('/api/proxy', {
          path: 'flight',
          user_id_in: userId,
          date_from: dateFrom,
          date_to: dateTo,
          limit: 100
        });
        
        if (Array.isArray(flights)) {
          console.log(`[API] ${flights.length} Flüge via date range geladen`);
          return flights;
        }
      } catch (fallbackError) {
        console.error(`[API] Auch Fallback fehlgeschlagen:`, fallbackError);
      }
      
      return [];
    }
  }

  // Sprint-Daten
  async fetchSprintData(userId) {
    try {
      const sprints = await this.fetchData('/api/proxy', {
        path: 'sprint',
        user_id_in: userId,
        limit: API.PAGINATION.DEFAULT_LIMIT
      });
      
      if (Array.isArray(sprints)) {
        return sprints;
      }
      
      return [];
    } catch (error) {
      console.error(`[API] Fehler beim Laden der Sprint-Daten:`, error);
      return [];
    }
  }

  // Achievements
  async fetchUserAchievements(userId) {
    return this.fetchData(`/api/proxy`, {
      path: `achievement/user/${userId}`
    }, {
      cacheTime: 2 * 60 * 60 * 1000 // 2 Stunden
    });
  }

  // Flug-Details
  async fetchFlightDetails(flightId) {
    return this.fetchData(`/api/proxy`, {
      path: `flightdetail/${flightId}`
    }, {
      cacheTime: 24 * 60 * 60 * 1000 // 24 Stunden
    });
  }

  // User-Details
  async fetchUserDetails(userId) {
    return this.fetchData(`/api/proxy`, {
      path: `user/${userId}`
    }, {
      cacheTime: 5 * 60 * 1000 // 5 Minuten
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

  // Cache-Statistiken
  getCacheStats() {
    const cacheEntries = Object.keys(this._cache).length;
    const clubFlightsCached = !!this._clubFlightsCache;
    const clubFlightsAge = this._clubFlightsCacheTime
      ? Math.floor((Date.now() - this._clubFlightsCacheTime) / 1000 / 60)
      : null;

    let currentSeasonCount = 0;
    let historicalCount = 0;
    let currentSeason = 'N/A';
    
    if (this._clubFlightsCache) {
      currentSeasonCount = this._clubFlightsCache.currentSeasonFlights?.length || 0;
      historicalCount = this._clubFlightsCache.historicalFlights?.length || 0;
      currentSeason = this._clubFlightsCache.metadata?.currentSeason || 'N/A';
    }

    return {
      entries: cacheEntries,
      clubFlightsCached,
      clubFlightsAge: clubFlightsAge ? `${clubFlightsAge} Minuten` : 'Nicht gecacht',
      currentSeason: currentSeason,
      currentSeasonFlights: currentSeasonCount,
      historicalFlights: historicalCount,
      totalCachedFlights: currentSeasonCount + historicalCount
    };
  }

  // Debug-Funktion für getrennte Flüge
  debugFlightSeparation() {
    if (!this._clubFlightsCache) {
      console.log('[API] Keine gecachten Club-Flüge vorhanden');
      return;
    }

    const cache = this._clubFlightsCache;
    console.log('\n🔍 DEBUG: Flug-Trennung nach Saison');
    console.log('====================================');
    console.log(`Aktuelle Saison: ${cache.metadata?.currentSeason || 'N/A'}`);
    console.log(`Saison-Start: ${cache.metadata?.currentSeasonStart ? new Date(cache.metadata.currentSeasonStart).toLocaleDateString() : 'N/A'}`);
    console.log(`Saison-Ende: ${cache.metadata?.currentSeasonEnd ? new Date(cache.metadata.currentSeasonEnd).toLocaleDateString() : 'N/A'}`);
    console.log(`\nAktuelle Saison: ${cache.currentSeasonFlights?.length || 0} Flüge`);
    console.log(`Historisch: ${cache.historicalFlights?.length || 0} Flüge`);
    
    if (cache.metadata?.seasonBreakdown) {
      console.log('\nSaison-Aufschlüsselung:');
      Object.entries(cache.metadata.seasonBreakdown)
        .sort(([a], [b]) => b.localeCompare(a))
        .forEach(([season, count]) => {
          const isCurrent = season === cache.metadata?.currentSeason ? ' (AKTUELL)' : '';
          console.log(`  ${season}: ${count} Flüge${isCurrent}`);
        });
    }
    
    console.log('\nCache-Alter:', this.getCacheStats().clubFlightsAge);
  }
}

export const apiClient = new WeGlideApiClient();