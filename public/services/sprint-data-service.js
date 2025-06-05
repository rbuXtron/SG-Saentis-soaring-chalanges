// services/sprint-data-service.js
/**
 * Sprint Data Service für SG Säntis Cup
 * Lädt und verarbeitet Sprint-Daten von WeGlide
 */

import { apiClient } from './weglide-api-service.js';

export class SprintDataService {
    constructor() {
        this.sprintCache = new Map();
        this.cacheExpiry = 30 * 60 * 1000; // 30 Minuten
    }

    /**
     * Lädt Sprint-Daten für alle Mitglieder
     */
    async loadAllMembersSprints(members, year = new Date().getFullYear()) {
        console.log(`📊 Lade Sprint-Daten für ${members.length} Mitglieder (${year})`);
        
        const allSprints = [];
        const batchSize = 5;
        
        for (let i = 0; i < members.length; i += batchSize) {
            const batch = members.slice(i, i + batchSize);
            
            const batchPromises = batch.map(async (member) => {
                try {
                    const sprints = await this.loadUserSprints(member.id, year);
                    return sprints.map(sprint => ({
                        ...sprint,
                        pilotName: member.name,
                        pilotId: member.id
                    }));
                } catch (error) {
                    console.warn(`⚠️ Fehler beim Laden der Sprints für ${member.name}:`, error);
                    return [];
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(sprints => allSprints.push(...sprints));
            
            console.log(`  Fortschritt: ${Math.min(i + batchSize, members.length)}/${members.length}`);
        }
        
        return this.processSprintData(allSprints);
    }

    /**
     * Lädt Sprint-Daten für einen einzelnen User
     */
    async loadUserSprints(userId, year) {
        const cacheKey = `${userId}-${year}`;
        
        // Cache prüfen
        if (this.sprintCache.has(cacheKey)) {
            const cached = this.sprintCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }
        }
        
        try {
            // WeGlide Sprint API verwenden
            const sprints = await apiClient.fetchData('/api/proxy', {
                path: 'sprint',
                user_id_in: userId,
                season_in: year,
                limit: 100
            });
            
            if (!Array.isArray(sprints)) {
                console.warn(`Keine Sprint-Daten für User ${userId}`);
                return [];
            }
            
            // In Cache speichern
            this.sprintCache.set(cacheKey, {
                data: sprints,
                timestamp: Date.now()
            });
            
            return sprints;
        } catch (error) {
            console.error(`Fehler beim Laden der Sprints für User ${userId}:`, error);
            
            // Fallback: Versuche aus normalen Flügen zu extrahieren
            return this.extractSprintsFromFlights(userId, year);
        }
    }

    /**
     * Fallback: Extrahiert Sprint-Daten aus normalen Flügen
     */
    async extractSprintsFromFlights(userId, year) {
        try {
            const flights = await apiClient.fetchUserFlights(userId, year);
            
            return flights
                .filter(flight => {
                    // Nur Flüge mit gültigen Contest-Daten
                    return flight.contest && 
                           flight.contest.speed > 0 && 
                           flight.contest.distance >= 50; // Min. 50km für Sprint
                })
                .map(flight => ({
                    id: flight.id,
                    user_id: userId,
                    contest: {
                        speed: flight.contest.speed,
                        distance: flight.contest.distance,
                        points: flight.contest.points || 0,
                        type: flight.contest.type || 'FAI'
                    },
                    scoring_date: flight.scoring_date,
                    takeoff_time: flight.takeoff_time,
                    landing_time: flight.landing_time,
                    aircraft: flight.aircraft,
                    takeoff_airport: flight.takeoff_airport,
                    is_from_flight: true // Markierung dass es aus Flugdaten extrahiert wurde
                }));
        } catch (error) {
            console.error(`Fallback Sprint-Extraktion fehlgeschlagen:`, error);
            return [];
        }
    }

    /**
     * Verarbeitet und bereichert Sprint-Daten
     */
    processSprintData(sprints) {
        // Berechne zusätzliche Metriken
        return sprints.map(sprint => {
            const duration = this.calculateDuration(sprint.takeoff_time, sprint.landing_time);
            const speedCategory = this.categorizeSpeed(sprint.contest?.speed || 0);
            
            return {
                ...sprint,
                duration,
                speedCategory,
                // Berechne Sprint-Punkte nach SG Säntis Regeln (falls gewünscht)
                sgPoints: this.calculateSGSprintPoints(sprint)
            };
        });
    }

    /**
     * Berechnet SG Säntis spezifische Sprint-Punkte
     */
    calculateSGSprintPoints(sprint) {
        if (!sprint.contest) return 0;
        
        const speed = sprint.contest.speed || 0;
        const distance = sprint.contest.distance || 0;
        
        // Beispielhafte Punkteberechnung
        // Kann nach Club-Regeln angepasst werden
        let points = 0;
        
        // Geschwindigkeitsbonus
        if (speed > 150) points += 50;
        else if (speed > 120) points += 30;
        else if (speed > 100) points += 20;
        else if (speed > 80) points += 10;
        
        // Distanzbonus
        if (distance > 500) points += 50;
        else if (distance > 300) points += 30;
        else if (distance > 200) points += 20;
        else if (distance > 100) points += 10;
        
        return points;
    }

    /**
     * Kategorisiert Geschwindigkeit
     */
    categorizeSpeed(speed) {
        if (speed >= 150) return 'exceptional';
        if (speed >= 120) return 'excellent';
        if (speed >= 100) return 'very_good';
        if (speed >= 80) return 'good';
        if (speed >= 60) return 'average';
        return 'below_average';
    }

    /**
     * Berechnet Flugdauer
     */
    calculateDuration(takeoff, landing) {
        if (!takeoff || !landing) return 0;
        
        const start = new Date(takeoff);
        const end = new Date(landing);
        const durationMs = end - start;
        
        return {
            hours: Math.floor(durationMs / (1000 * 60 * 60)),
            minutes: Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60)),
            totalMinutes: Math.floor(durationMs / (1000 * 60))
        };
    }

    /**
     * Generiert Sprint-Statistiken
     */
    generateSprintStatistics(sprints) {
        if (!sprints || sprints.length === 0) {
            return {
                totalSprints: 0,
                averageSpeed: 0,
                maxSpeed: 0,
                topSpeedPilot: '',
                averageDistance: 0,
                maxDistance: 0,
                topDistancePilot: '',
                speedCategories: {},
                monthlyDistribution: {}
            };
        }

        // Basis-Statistiken
        const stats = {
            totalSprints: sprints.length,
            averageSpeed: 0,
            maxSpeed: 0,
            topSpeedPilot: '',
            averageDistance: 0,
            maxDistance: 0,
            topDistancePilot: '',
            speedCategories: {},
            monthlyDistribution: {},
            pilotRankings: new Map()
        };

        // Berechne Statistiken
        let totalSpeed = 0;
        let totalDistance = 0;

        sprints.forEach(sprint => {
            const speed = sprint.contest?.speed || 0;
            const distance = sprint.contest?.distance || 0;
            
            totalSpeed += speed;
            totalDistance += distance;
            
            // Max Speed
            if (speed > stats.maxSpeed) {
                stats.maxSpeed = speed;
                stats.topSpeedPilot = sprint.pilotName;
            }
            
            // Max Distance
            if (distance > stats.maxDistance) {
                stats.maxDistance = distance;
                stats.topDistancePilot = sprint.pilotName;
            }
            
            // Speed Categories
            const category = sprint.speedCategory || this.categorizeSpeed(speed);
            stats.speedCategories[category] = (stats.speedCategories[category] || 0) + 1;
            
            // Monthly Distribution
            const month = new Date(sprint.scoring_date).toLocaleDateString('de-DE', { 
                month: 'short', 
                year: 'numeric' 
            });
            stats.monthlyDistribution[month] = (stats.monthlyDistribution[month] || 0) + 1;
            
            // Pilot Rankings
            if (!stats.pilotRankings.has(sprint.pilotName)) {
                stats.pilotRankings.set(sprint.pilotName, {
                    name: sprint.pilotName,
                    sprintCount: 0,
                    totalSpeed: 0,
                    maxSpeed: 0,
                    totalDistance: 0,
                    maxDistance: 0
                });
            }
            
            const pilotStats = stats.pilotRankings.get(sprint.pilotName);
            pilotStats.sprintCount++;
            pilotStats.totalSpeed += speed;
            pilotStats.maxSpeed = Math.max(pilotStats.maxSpeed, speed);
            pilotStats.totalDistance += distance;
            pilotStats.maxDistance = Math.max(pilotStats.maxDistance, distance);
        });

        // Durchschnitte berechnen
        stats.averageSpeed = sprints.length > 0 ? totalSpeed / sprints.length : 0;
        stats.averageDistance = sprints.length > 0 ? totalDistance / sprints.length : 0;

        // Pilot Rankings finalisieren
        stats.pilotRankings.forEach(pilot => {
            pilot.averageSpeed = pilot.sprintCount > 0 ? 
                pilot.totalSpeed / pilot.sprintCount : 0;
            pilot.averageDistance = pilot.sprintCount > 0 ? 
                pilot.totalDistance / pilot.sprintCount : 0;
        });

        return stats;
    }

    /**
     * Cache leeren
     */
    clearCache() {
        this.sprintCache.clear();
        console.log('Sprint-Cache geleert');
    }
}

// Singleton-Instanz
export const sprintDataService = new SprintDataService();