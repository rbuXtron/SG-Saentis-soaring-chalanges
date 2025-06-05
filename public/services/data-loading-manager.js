// services/data-loading-manager.js
/**
 * Zentraler Manager für optimiertes Daten-Loading
 * Verhindert redundante API-Calls und koordiniert das Laden
 */

class DataLoadingManager {
    constructor() {
        // Caches für verschiedene Datentypen
        this.achievementsCache = new Map(); // userId -> achievements
        this.flightDetailsCache = new Map(); // flightId -> details
        this.userFlightsCache = new Map(); // userId-year -> flights
        
        // Loading-States
        this.loadingAchievements = new Map(); // userId -> Promise
        this.loadingFlightDetails = new Map(); // flightId -> Promise
        
        // Statistiken
        this.stats = {
            achievementCalls: 0,
            flightDetailCalls: 0,
            cacheHits: 0,
            apiCalls: 0
        };
    }

    /**
     * Lädt Achievements für einen User (mit Deduplizierung)
     */
    async loadUserAchievements(userId) {
        // Cache-Check
        if (this.achievementsCache.has(userId)) {
            this.stats.cacheHits++;
            console.log(`✅ Achievements Cache-Hit für User ${userId}`);
            return this.achievementsCache.get(userId);
        }

        // Prüfe ob bereits ein Loading läuft
        if (this.loadingAchievements.has(userId)) {
            console.log(`⏳ Warte auf laufenden Achievement-Call für User ${userId}`);
            return this.loadingAchievements.get(userId);
        }

        // Starte neuen API-Call
        console.log(`📡 Lade Achievements für User ${userId}`);
        this.stats.achievementCalls++;
        this.stats.apiCalls++;

        const loadPromise = this._fetchAchievements(userId);
        this.loadingAchievements.set(userId, loadPromise);

        try {
            const achievements = await loadPromise;
            this.achievementsCache.set(userId, achievements);
            return achievements;
        } finally {
            this.loadingAchievements.delete(userId);
        }
    }

    /**
     * Lädt Flight Details (mit Deduplizierung)
     */
    async loadFlightDetails(flightId) {
        if (!flightId) return null;

        // Cache-Check
        if (this.flightDetailsCache.has(flightId)) {
            this.stats.cacheHits++;
            return this.flightDetailsCache.get(flightId);
        }

        // Prüfe ob bereits ein Loading läuft
        if (this.loadingFlightDetails.has(flightId)) {
            return this.loadingFlightDetails.get(flightId);
        }

        // Starte neuen API-Call
        this.stats.flightDetailCalls++;
        this.stats.apiCalls++;

        const loadPromise = this._fetchFlightDetails(flightId);
        this.loadingFlightDetails.set(flightId, loadPromise);

        try {
            const details = await loadPromise;
            if (details) {
                this.flightDetailsCache.set(flightId, details);
            }
            return details;
        } finally {
            this.loadingFlightDetails.delete(flightId);
        }
    }

    /**
     * Batch-Loading für Flight Details
     */
    async loadFlightDetailsBatch(flightIds) {
        const uniqueIds = [...new Set(flightIds.filter(id => id))];
        console.log(`📦 Batch-Loading für ${uniqueIds.length} Flüge`);

        // Separiere gecachte und neue IDs
        const cached = [];
        const toLoad = [];

        uniqueIds.forEach(id => {
            if (this.flightDetailsCache.has(id)) {
                cached.push(id);
            } else {
                toLoad.push(id);
            }
        });

        console.log(`  ✅ ${cached.length} aus Cache`);
        console.log(`  📡 ${toLoad.length} müssen geladen werden`);

        // Lade neue Details parallel (mit Limit)
        const batchSize = 10;
        const results = new Map();

        // Füge gecachte Ergebnisse hinzu
        cached.forEach(id => {
            results.set(id, this.flightDetailsCache.get(id));
        });

        // Lade neue in Batches
        for (let i = 0; i < toLoad.length; i += batchSize) {
            const batch = toLoad.slice(i, i + batchSize);
            const promises = batch.map(id => this.loadFlightDetails(id));
            const batchResults = await Promise.all(promises);
            
            batch.forEach((id, index) => {
                if (batchResults[index]) {
                    results.set(id, batchResults[index]);
                }
            });

            // Rate limiting
            if (i + batchSize < toLoad.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        return results;
    }

    /**
     * Private API-Call Methoden
     */
    async _fetchAchievements(userId) {
        try {
            const response = await fetch(`/api/proxy?path=achievement/user/${userId}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.error(`❌ Fehler beim Laden der Achievements für User ${userId}:`, error);
            return [];
        }
    }

    async _fetchFlightDetails(flightId) {
        try {
            const response = await fetch(`/api/proxy?path=flightdetail/${flightId}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`❌ Fehler beim Laden der Details für Flug ${flightId}:`, error);
            return null;
        }
    }

    /**
     * Cache-Management
     */
    clearCache() {
        this.achievementsCache.clear();
        this.flightDetailsCache.clear();
        this.userFlightsCache.clear();
        console.log('✅ Data Loading Manager Cache geleert');
    }

    /**
     * Statistiken ausgeben
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: {
                achievements: this.achievementsCache.size,
                flightDetails: this.flightDetailsCache.size,
                userFlights: this.userFlightsCache.size
            },
            cacheEfficiency: this.stats.apiCalls > 0 
                ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.apiCalls)) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    printStats() {
        console.log('\n📊 Data Loading Manager Statistiken:');
        console.log('=====================================');
        console.log(`Achievement API-Calls: ${this.stats.achievementCalls}`);
        console.log(`Flight Detail API-Calls: ${this.stats.flightDetailCalls}`);
        console.log(`Cache-Hits: ${this.stats.cacheHits}`);
        console.log(`Gesamt API-Calls: ${this.stats.apiCalls}`);
        console.log(`Cache-Effizienz: ${this.getStats().cacheEfficiency}`);
        console.log('=====================================\n');
    }
}

// Singleton-Instanz
export const dataLoadingManager = new DataLoadingManager();

// Globaler Zugriff für Debugging
window.DataLoadingManager = dataLoadingManager;