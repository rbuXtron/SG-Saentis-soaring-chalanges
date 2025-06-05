// services/sprint-data-service.js
/**
 * Sprint Data Service für SG Säntis Cup
 * Lädt und verarbeitet Sprint-Daten von WeGlide
 * Version 2.0 - Nur aktuelle Jahr (2025)
 */

import { apiClient } from './weglide-api-service.js';

export class SprintDataService {
    constructor() {
        this.sprintCache = new Map();
        this.cacheExpiry = 30 * 60 * 1000; // 30 Minuten
        this.currentYear = new Date().getFullYear(); // 2025
    }

    /**
     * Lädt Sprint-Daten für alle Mitglieder - NUR aktuelles Jahr
     */
    async loadAllMembersSprints(members, year = null) {
        // Forciere aktuelles Jahr wenn nicht explizit anders angegeben
        const targetYear = year || this.currentYear;
        
        console.log(`📊 Lade Sprint-Daten für ${members.length} Mitglieder (Jahr: ${targetYear})`);
        
        const allSprints = [];
        const batchSize = 10;
        
        for (let i = 0; i < members.length; i += batchSize) {
            const batch = members.slice(i, i + batchSize);
            
            const batchPromises = batch.map(async (member) => {
                try {
                    // Lade nur Sprints für das spezifizierte Jahr
                    const sprints = await this.loadUserSprints(member.id, targetYear);
                    return sprints.map(sprint => ({
                        ...sprint,
                        pilotName: member.name,
                        pilotId: member.id,
                        year: targetYear
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
        
        console.log(`✅ ${allSprints.length} Sprint-Einträge für ${targetYear} geladen`);
        
        return this.processSprintData(allSprints, targetYear);
    }

    /**
     * Lädt Sprint-Daten für einen einzelnen User für ein spezifisches Jahr
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
            // WeGlide Sprint API - nutzt flight endpoint mit contest=sprint
            const response = await apiClient.fetchData('/api/proxy', {
                path: 'sprint',
                user_id_in: userId,
                season_in: year,
                limit: 100
            });
            
            // Die Antwort ist ein Objekt mit flights Array
            let sprints = [];
            if (response && response.flights && Array.isArray(response.flights)) {
                sprints = response.flights;
            } else if (Array.isArray(response)) {
                sprints = response;
            } else {
                console.warn(`Unerwartetes Sprint-Datenformat für User ${userId}:`, response);
                return [];
            }
            
            // Zusätzlicher Filter für Sicherheit - nur Sprint-Contest Flüge
            const filteredSprints = sprints.filter(sprint => {
                const sprintYear = new Date(sprint.scoring_date || sprint.takeoff_time).getFullYear();
                return sprintYear === year && sprint.contest && sprint.contest.type === 'sprint';
            });
            
            // In Cache speichern
            this.sprintCache.set(cacheKey, {
                data: filteredSprints,
                timestamp: Date.now()
            });
            
            console.log(`  ${filteredSprints.length} Sprints für User ${userId} in ${year}`);
            
            return filteredSprints;
        } catch (error) {
            console.error(`Fehler beim Laden der Sprints für User ${userId}:`, error);
            
            // Fallback: Versuche aus normalen Flügen zu extrahieren
            return this.extractSprintsFromFlights(userId, year);
        }
    }

    /**
     * Fallback: Extrahiert Sprint-Daten aus normalen Flügen für ein spezifisches Jahr
     */
    async extractSprintsFromFlights(userId, year) {
        try {
            const flights = await apiClient.fetchUserFlights(userId, year);
            
            return flights
                .filter(flight => {
                    // Nur Flüge aus dem gewünschten Jahr
                    const flightYear = new Date(flight.scoring_date || flight.takeoff_time).getFullYear();
                    if (flightYear !== year) return false;
                    
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
                    is_from_flight: true,
                    year: year
                }));
        } catch (error) {
            console.error(`Fallback Sprint-Extraktion fehlgeschlagen:`, error);
            return [];
        }
    }

    /**
     * Verarbeitet und bereichert Sprint-Daten für ein spezifisches Jahr
     */
    processSprintData(sprints, year) {
        // Filtere nochmals zur Sicherheit
        const yearSprints = sprints.filter(sprint => {
            const sprintYear = sprint.year || 
                new Date(sprint.scoring_date || sprint.takeoff_time).getFullYear();
            return sprintYear === year;
        });

        // Berechne zusätzliche Metriken
        return yearSprints.map(sprint => {
            const duration = this.calculateDuration(sprint.takeoff_time, sprint.landing_time);
            const speedCategory = this.categorizeSpeed(sprint.contest?.speed || 0);
            
            return {
                ...sprint,
                duration,
                speedCategory,
                // Berechne Sprint-Punkte nach SG Säntis Regeln
                sgPoints: this.calculateSGSprintPoints(sprint),
                verifiedYear: year
            };
        });
    }

    /**
     * Generiert Sprint-Statistiken für ein spezifisches Jahr
     */
    generateSprintStatistics(sprints, year = null) {
        const targetYear = year || this.currentYear;
        
        // Filtere nach Jahr
        const yearSprints = sprints.filter(sprint => {
            const sprintYear = sprint.year || sprint.verifiedYear ||
                new Date(sprint.scoring_date || sprint.takeoff_time).getFullYear();
            return sprintYear === targetYear;
        });

        if (!yearSprints || yearSprints.length === 0) {
            return {
                year: targetYear,
                totalSprints: 0,
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
        }

        // Berechne Statistiken nur für das spezifische Jahr
        const stats = {
            year: targetYear,
            totalSprints: yearSprints.length,
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

        let totalSpeed = 0;
        let totalDistance = 0;

        yearSprints.forEach(sprint => {
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
            
            // Monthly Distribution (nur für das aktuelle Jahr)
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
                    maxDistance: 0,
                    year: targetYear
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
        stats.averageSpeed = yearSprints.length > 0 ? totalSpeed / yearSprints.length : 0;
        stats.averageDistance = yearSprints.length > 0 ? totalDistance / yearSprints.length : 0;

        // Pilot Rankings finalisieren
        stats.pilotRankings.forEach(pilot => {
            pilot.averageSpeed = pilot.sprintCount > 0 ? 
                pilot.totalSpeed / pilot.sprintCount : 0;
            pilot.averageDistance = pilot.sprintCount > 0 ? 
                pilot.totalDistance / pilot.sprintCount : 0;
        });

        console.log(`📊 Sprint-Statistiken für ${targetYear}:`, {
            total: stats.totalSprints,
            maxSpeed: `${stats.maxSpeed.toFixed(1)} km/h`,
            pilots: stats.pilotRankings.size
        });

        return stats;
    }

    // Hilfsfunktionen bleiben gleich...
    calculateSGSprintPoints(sprint) {
        if (!sprint.contest) return 0;
        
        const speed = sprint.contest.speed || 0;
        const distance = sprint.contest.distance || 0;
        
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

    categorizeSpeed(speed) {
        if (speed >= 150) return 'exceptional';
        if (speed >= 120) return 'excellent';
        if (speed >= 100) return 'very_good';
        if (speed >= 80) return 'good';
        if (speed >= 60) return 'average';
        return 'below_average';
    }

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
     * Cache leeren
     */
    clearCache() {
        this.sprintCache.clear();
        console.log('Sprint-Cache geleert');
    }
}

// Singleton-Instanz
export const sprintDataService = new SprintDataService();