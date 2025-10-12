import { apiClient } from './weglide-api-service.js';

export class SprintDataService {
    constructor() {
        this.sprintCache = new Map();
        this.cacheExpiry = 30 * 60 * 1000;
        this.currentYear = new Date().getFullYear();
    }

    async loadAllMembersSprints(members, year = null) {
        const targetYear = year || this.currentYear;
        
        console.log(`🏃 Lade Sprint-Daten für ${members.length} Mitglieder (Jahr: ${targetYear})`);
        
        const allSprints = [];
        const batchSize = 10;
        
        for (let i = 0; i < members.length; i += batchSize) {
            const batch = members.slice(i, i + batchSize);
            
            const batchPromises = batch.map(async (member) => {
                try {
                    const sprints = await this.loadUserSprints(member.id, targetYear);
                    if (sprints.length > 0) {
                        console.log(`  ✅ ${member.name}: ${sprints.length} Sprints`);
                    }
                    return sprints.map(sprint => ({
                        ...sprint,
                        pilotName: member.name,
                        pilotId: member.id,
                        year: targetYear
                    }));
                } catch (error) {
                    console.warn(`⚠️ Sprint-Fehler bei ${member.name}:`, error.message);
                    return [];
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(sprints => allSprints.push(...sprints));
        }
        
        console.log(`📊 ${allSprints.length} Sprint-Einträge für ${targetYear} geladen`);
        
        return this.processSprintData(allSprints, targetYear);
    }

    async loadUserSprints(userId, year) {
        const cacheKey = `${userId}-${year}`;
        
        if (this.sprintCache.has(cacheKey)) {
            const cached = this.sprintCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }
        }
        
        try {
            const response = await apiClient.fetchData('/api/proxy', {
                path: 'sprint',
                user_id_in: userId,
                season_in: year,
                limit: 100
            });
            
            if (!response) {
                return [];
            }
            
            let sprints = [];
            
            // Handle verschiedene Response-Formate
            if (response.flights && Array.isArray(response.flights)) {
                sprints = response.flights;
            } else if (Array.isArray(response)) {
                sprints = response;
            } else {
                return [];
            }
            
            // Filter für gültige Sprint-Flüge
            const filteredSprints = sprints.filter(sprint => {
                const sprintDate = sprint.scoring_date || sprint.takeoff_time;
                if (!sprintDate) return false;
                
                const sprintYear = new Date(sprintDate).getFullYear();
                if (sprintYear !== year) return false;
                
                if (!sprint.contest) return false;
                
                const isSprintType = sprint.contest.type === 'sprint';
                const hasValidData = sprint.contest.speed > 0 && sprint.contest.distance >= 50;
                
                return isSprintType || hasValidData;
            });
            
            // Cache speichern
            this.sprintCache.set(cacheKey, {
                data: filteredSprints,
                timestamp: Date.now()
            });
            
            return filteredSprints;
            
        } catch (error) {
            console.error(`API-Fehler für User ${userId}:`, error.message);
            return this.extractSprintsFromFlights(userId, year);
        }
    }

    async extractSprintsFromFlights(userId, year) {
        try {
            const flights = await apiClient.fetchUserFlights(userId, year);
            
            const sprints = flights
                .filter(flight => {
                    const flightYear = new Date(flight.scoring_date || flight.takeoff_time).getFullYear();
                    if (flightYear !== year) return false;
                    
                    return flight.contest && 
                           flight.contest.speed > 0 && 
                           flight.contest.distance >= 100;
                })
                .map(flight => ({
                    id: flight.id,
                    user_id: userId,
                    contest: {
                        speed: flight.contest.speed,
                        distance: flight.contest.distance,
                        points: flight.contest.points || 0,
                        type: 'extracted'
                    },
                    scoring_date: flight.scoring_date,
                    takeoff_time: flight.takeoff_time,
                    landing_time: flight.landing_time,
                    aircraft: flight.aircraft,
                    takeoff_airport: flight.takeoff_airport,
                    is_from_flight: true,
                    year: year
                }));
            
            return sprints;
            
        } catch (error) {
            console.error(`Fallback fehlgeschlagen:`, error.message);
            return [];
        }
    }

    processSprintData(sprints, year) {
        return sprints.map(sprint => ({
            ...sprint,
            duration: this.calculateDuration(sprint.takeoff_time, sprint.landing_time),
            speedCategory: this.categorizeSpeed(sprint.contest?.speed || 0),
            sgPoints: sprint.contest?.points || 0,
            verifiedYear: year
        }));
    }

    generateSprintStatistics(sprints, year = null) {
        const targetYear = year || this.currentYear;
        
        const yearSprints = sprints.filter(sprint => {
            const sprintYear = sprint.year || sprint.verifiedYear ||
                new Date(sprint.scoring_date || sprint.takeoff_time).getFullYear();
            return sprintYear === targetYear;
        });

        if (!yearSprints.length) {
            return {
                year: targetYear,
                totalSprints: 0,
                averageSpeed: 0,
                maxSpeed: 0,
                topSpeedPilot: '',
                averageDistance: 0,
                maxDistance: 0,
                topDistancePilot: ''
            };
        }

        const stats = {
            year: targetYear,
            totalSprints: yearSprints.length,
            averageSpeed: 0,
            maxSpeed: 0,
            topSpeedPilot: '',
            averageDistance: 0,
            maxDistance: 0,
            topDistancePilot: ''
        };

        let totalSpeed = 0;
        let totalDistance = 0;

        yearSprints.forEach(sprint => {
            const speed = sprint.contest?.speed || 0;
            const distance = sprint.contest?.distance || 0;
            
            totalSpeed += speed;
            totalDistance += distance;
            
            if (speed > stats.maxSpeed) {
                stats.maxSpeed = speed;
                stats.topSpeedPilot = sprint.pilotName;
            }
            
            if (distance > stats.maxDistance) {
                stats.maxDistance = distance;
                stats.topDistancePilot = sprint.pilotName;
            }
        });

        stats.averageSpeed = totalSpeed / yearSprints.length;
        stats.averageDistance = totalDistance / yearSprints.length;

        return stats;
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
        if (!takeoff || !landing) return { hours: 0, minutes: 0, totalMinutes: 0 };
        
        const start = new Date(takeoff);
        const end = new Date(landing);
        const durationMs = end - start;
        
        return {
            hours: Math.floor(durationMs / (1000 * 60 * 60)),
            minutes: Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60)),
            totalMinutes: Math.floor(durationMs / (1000 * 60))
        };
    }

    clearCache() {
        this.sprintCache.clear();
        console.log('Sprint-Cache geleert');
    }
}

export const sprintDataService = new SprintDataService();