/**
 * SG Säntis Cup - Badge Flight Analyzer
 * 
 * Analysiert Flüge seit Saisonbeginn und extrahiert Achievements direkt aus den Flugdaten
 * Version 2.0 - Mit Co-Pilot Filterung
 */

import { apiClient } from './weglide-api-service.js';

const SEASON_START = new Date('2024-10-01');
const DEBUG_MODE = false;

/**
 * Lädt und analysiert alle Badges eines Piloten basierend auf seinen Flügen
 */
export async function analyzePilotBadgesFromFlights(userId, pilotName) {
    console.log(`🔍 Analysiere Badges für ${pilotName} (ID: ${userId}) aus Flügen...`);
    
    try {
        // 1. Lade alle Flüge seit Saisonbeginn
        const flights = await loadFlightsSinceSeasonStart(userId);
        console.log(`  → ${flights.length} Flüge seit Saisonbeginn gefunden`);
        
        if (flights.length === 0) {
            return createEmptyBadgeResult(pilotName);
        }
        
        // 2. Analysiere jeden Flug auf Achievements
        const allBadges = [];
        const flightBadgeMap = new Map(); // Flug-ID zu Badges Mapping
        let skippedCoPilotBadges = 0;
        
        // Batch-Verarbeitung für bessere Performance
        const batchSize = 5;
        for (let i = 0; i < flights.length; i += batchSize) {
            const batch = flights.slice(i, i + batchSize);
            
            // Parallele Verarbeitung der Batch
            const batchPromises = batch.map(async (flight) => {
                try {
                    const flightDetails = await apiClient.fetchFlightDetails(flight.id);
                    
                    if (flightDetails) {
                        // WICHTIG: Prüfe ob der aktuelle Pilot Co-Pilot in diesem Flug ist
                        const isPilotCoPilot = checkIfPilotIsCoPilot(flightDetails, userId, pilotName);
                        
                        if (isPilotCoPilot) {
                            if (DEBUG_MODE) {
                                console.log(`    ⚠️ Flug ${flight.id}: ${pilotName} ist Co-Pilot - Badges werden übersprungen`);
                            }
                            skippedCoPilotBadges++;
                            return; // Überspringe diesen Flug komplett
                        }
                        
                        // Prüfe achievements (nicht achievement)
                        if (flightDetails.achievements && Array.isArray(flightDetails.achievements)) {
                            const achievements = flightDetails.achievements;
                            
                            if (achievements.length > 0) {
                                if (DEBUG_MODE) {
                                    console.log(`    ✅ Flug ${flight.id} vom ${new Date(flight.scoring_date).toLocaleDateString()}: ${achievements.length} Achievements`);
                                }
                                
                                // Verarbeite jedes Achievement
                                achievements.forEach(achievement => {
                                    const badge = {
                                        id: `${achievement.id}_${flight.id}`,
                                        badge_id: achievement.badge_id,
                                        name: achievement.name || achievement.badge?.name || achievement.badge_id,
                                        description: achievement.description || achievement.badge?.description || '',
                                        logo: achievement.logo || achievement.badge?.logo || null,
                                        value: achievement.value,
                                        points: achievement.points || 0,
                                        level: achievement.level || null,
                                        flight_id: flight.id,
                                        flight_date: flight.scoring_date || flight.takeoff_time,
                                        flight_distance: flight.contest?.distance || flight.distance || flight.km || 0,
                                        aircraft: flight.aircraft?.name || 'Unbekannt',
                                        achieved_at: flight.scoring_date,
                                        season: '2024/2025',
                                        verified: true, // Immer verifiziert, da direkt aus Flug
                                        raw_achievement: achievement,
                                        is_primary_pilot: true // Markierung dass es als Hauptpilot erreicht wurde
                                    };
                                    
                                    allBadges.push(badge);
                                });
                                
                                flightBadgeMap.set(flight.id, achievements);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`  ❌ Fehler bei Flug ${flight.id}:`, error.message);
                }
            });
            
            await Promise.all(batchPromises);
            
            // Progress Update
            if (i + batchSize < flights.length) {
                console.log(`    Fortschritt: ${Math.min(i + batchSize, flights.length)}/${flights.length} Flüge analysiert`);
            }
        }
        
        // 3. Gruppiere und zähle Badges
        const badgeStats = analyzeBadgeStats(allBadges);
        
        console.log(`  ✅ Analyse abgeschlossen für ${pilotName}:`);
        console.log(`    → ${badgeStats.totalBadges} Badges gefunden`);
        console.log(`    → ${badgeStats.uniqueCategories} verschiedene Kategorien`);
        console.log(`    → ${badgeStats.multiLevelBadges} Multi-Level Badges`);
        if (skippedCoPilotBadges > 0) {
            console.log(`    → ${skippedCoPilotBadges} Flüge übersprungen (Pilot war Co-Pilot)`);
        }
        
        return {
            pilotName: pilotName,
            userId: userId,
            badges: allBadges,
            badgeCount: badgeStats.totalBadges,
            categoryCount: badgeStats.uniqueCategories,
            multiLevelCount: badgeStats.multiLevelBadges,
            flightsAnalyzed: flights.length,
            flightsWithBadges: flightBadgeMap.size,
            skippedCoPilotFlights: skippedCoPilotBadges,
            stats: badgeStats
        };
        
    } catch (error) {
        console.error(`❌ Fehler bei Badge-Analyse für ${pilotName}:`, error);
        return createEmptyBadgeResult(pilotName);
    }
}

/**
 * Prüft ob der angegebene Pilot Co-Pilot in einem Flug ist
 */
function checkIfPilotIsCoPilot(flightDetails, userId, pilotName) {
    if (!flightDetails) return false;
    
    // Prüfe verschiedene mögliche Co-Pilot Felder
    const coPilotData = flightDetails.co_user || flightDetails.co_pilot || flightDetails.copilot;
    
    if (!coPilotData) return false;
    
    // Co-Pilot kann ein Objekt oder eine ID sein
    if (typeof coPilotData === 'object') {
        // Prüfe ID
        if (coPilotData.id && coPilotData.id === userId) {
            return true;
        }
        // Prüfe Namen (falls ID nicht verfügbar)
        if (coPilotData.name && coPilotData.name === pilotName) {
            return true;
        }
    } else if (typeof coPilotData === 'number' || typeof coPilotData === 'string') {
        // Direkte ID-Prüfung
        if (parseInt(coPilotData) === parseInt(userId)) {
            return true;
        }
    }
    
    // Zusätzliche Prüfung für co_user_id oder co_pilot_id
    if (flightDetails.co_user_id && parseInt(flightDetails.co_user_id) === parseInt(userId)) {
        return true;
    }
    
    if (flightDetails.co_pilot_id && parseInt(flightDetails.co_pilot_id) === parseInt(userId)) {
        return true;
    }
    
    // Prüfe auch co_user_name falls vorhanden
    if (flightDetails.co_user_name && flightDetails.co_user_name === pilotName) {
        return true;
    }
    
    return false;
}

/**
 * Lädt alle Flüge eines Piloten seit Saisonbeginn
 */
async function loadFlightsSinceSeasonStart(userId) {
    const allFlights = [];
    
    // Lade Flüge für 2024 und 2025
    const years = [2024, 2025];
    
    for (const year of years) {
        try {
            const flights = await apiClient.fetchUserFlights(userId, year);
            
            if (Array.isArray(flights)) {
                // Filtere nur Flüge seit Saisonbeginn
                const seasonFlights = flights.filter(flight => {
                    const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
                    return flightDate >= SEASON_START;
                });
                
                allFlights.push(...seasonFlights);
                
                if (DEBUG_MODE && seasonFlights.length > 0) {
                    console.log(`    Jahr ${year}: ${seasonFlights.length} Flüge seit Saisonbeginn`);
                }
            }
        } catch (error) {
            console.warn(`    Fehler beim Laden der Flüge für ${year}:`, error.message);
        }
    }
    
    // Sortiere nach Datum (neueste zuerst)
    allFlights.sort((a, b) => {
        const dateA = new Date(a.scoring_date || a.takeoff_time);
        const dateB = new Date(b.scoring_date || b.takeoff_time);
        return dateB - dateA;
    });
    
    return allFlights;
}

/**
 * Analysiert Badge-Statistiken
 */
function analyzeBadgeStats(badges) {
    const stats = {
        totalBadges: badges.length,
        uniqueCategories: 0,
        multiLevelBadges: 0,
        badgesByType: {},
        badgesByMonth: {},
        topBadges: [],
        primaryPilotBadges: 0,
        coPilotBadges: 0
    };
    
    // Zähle unique Kategorien
    const categories = new Set();
    const multiLevelTracker = new Map(); // badge_id -> levels
    
    badges.forEach(badge => {
        // Kategorien
        categories.add(badge.badge_id);
        
        // Zähle Primary vs Co-Pilot Badges
        if (badge.is_primary_pilot) {
            stats.primaryPilotBadges++;
        } else {
            stats.coPilotBadges++;
        }
        
        // Multi-Level Tracking
        if (!multiLevelTracker.has(badge.badge_id)) {
            multiLevelTracker.set(badge.badge_id, new Set());
        }
        if (badge.level) {
            multiLevelTracker.get(badge.badge_id).add(badge.level);
        }
        
        // Badge-Typen
        const type = getBadgeType(badge.badge_id);
        if (!stats.badgesByType[type]) {
            stats.badgesByType[type] = 0;
        }
        stats.badgesByType[type]++;
        
        // Badges nach Monat
        const month = new Date(badge.flight_date).toLocaleDateString('de-DE', { year: 'numeric', month: 'long' });
        if (!stats.badgesByMonth[month]) {
            stats.badgesByMonth[month] = 0;
        }
        stats.badgesByMonth[month]++;
    });
    
    stats.uniqueCategories = categories.size;
    
    // Zähle Multi-Level Badges (mehr als 1 Level erreicht)
    multiLevelTracker.forEach((levels, badgeId) => {
        if (levels.size > 1) {
            stats.multiLevelBadges++;
        }
    });
    
    // Top Badges (häufigste)
    const badgeFrequency = {};
    badges.forEach(badge => {
        const key = badge.name || badge.badge_id;
        badgeFrequency[key] = (badgeFrequency[key] || 0) + 1;
    });
    
    stats.topBadges = Object.entries(badgeFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
    
    return stats;
}

/**
 * Ermittelt den Badge-Typ
 */
function getBadgeType(badgeId) {
    if (!badgeId) return 'other';
    
    const id = badgeId.toLowerCase();
    
    if (id.includes('distance') || id.includes('km')) return 'distance';
    if (id.includes('altitude') || id.includes('height')) return 'altitude';
    if (id.includes('duration') || id.includes('hour')) return 'duration';
    if (id.includes('speed')) return 'speed';
    if (id.includes('points') || id.includes('score')) return 'points';
    if (id.includes('xc') || id.includes('cross')) return 'xc';
    
    return 'other';
}

/**
 * Erstellt ein leeres Badge-Ergebnis
 */
function createEmptyBadgeResult(pilotName) {
    return {
        pilotName: pilotName,
        userId: null,
        badges: [],
        badgeCount: 0,
        categoryCount: 0,
        multiLevelCount: 0,
        flightsAnalyzed: 0,
        flightsWithBadges: 0,
        skippedCoPilotFlights: 0,
        stats: {
            totalBadges: 0,
            uniqueCategories: 0,
            multiLevelBadges: 0,
            badgesByType: {},
            badgesByMonth: {},
            topBadges: [],
            primaryPilotBadges: 0,
            coPilotBadges: 0
        }
    };
}

/**
 * Analysiert Badges für alle Piloten
 */
export async function analyzeAllPilotBadges(pilots) {
    console.log(`🏅 Starte Badge-Analyse für ${pilots.length} Piloten...`);
    const startTime = Date.now();
    
    const results = [];
    const batchSize = 3; // Weniger parallel wegen vieler API-Calls pro Pilot
    
    for (let i = 0; i < pilots.length; i += batchSize) {
        const batch = pilots.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
            batch.map(pilot => analyzePilotBadgesFromFlights(pilot.userId || pilot.id, pilot.name))
        );
        
        results.push(...batchResults);
        
        // Status Update
        console.log(`📊 Fortschritt: ${Math.min(i + batchSize, pilots.length)}/${pilots.length} Piloten analysiert`);
        
        // Kleine Pause zwischen Batches
        if (i + batchSize < pilots.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    const duration = (Date.now() - startTime) / 1000;
    
    // Zusammenfassung
    const totalBadges = results.reduce((sum, r) => sum + r.badgeCount, 0);
    const pilotsWithBadges = results.filter(r => r.badgeCount > 0).length;
    const totalSkippedFlights = results.reduce((sum, r) => sum + (r.skippedCoPilotFlights || 0), 0);
    
    console.log(`\n✅ Badge-Analyse abgeschlossen in ${duration.toFixed(1)}s`);
    console.log(`📊 Zusammenfassung:`);
    console.log(`  → ${totalBadges} Badges insgesamt gefunden`);
    console.log(`  → ${pilotsWithBadges} von ${pilots.length} Piloten haben Badges`);
    if (totalSkippedFlights > 0) {
        console.log(`  → ${totalSkippedFlights} Flüge übersprungen (Pilot war Co-Pilot)`);
    }
    
    // Top 5 Piloten
    const topPilots = [...results]
        .sort((a, b) => b.badgeCount - a.badgeCount)
        .slice(0, 5);
    
    console.log(`\n🏆 Top 5 Piloten:`);
    topPilots.forEach((pilot, index) => {
        console.log(`  ${index + 1}. ${pilot.pilotName}: ${pilot.badgeCount} Badges`);
    });
    
    return results;
}