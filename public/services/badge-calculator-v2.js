/**
 * SG Säntis Cup - Badge Calculator V2
 * 
 * Implementiert den exakten Algorithmus:
 * 1. Lade alle User eines Vereins
 * 2. Lade historische Flüge für Badge-Verifizierung
 * 3. Lade Badges jünger als 30.09.2024
 * 4. Evaluiere Multi-Level Badges (points > 1)
 * 5. Durchsuche ältere Flüge für Badge-Historie
 * 6. Ziehe gefundene Punkte ab
 * 
 * WICHTIG: Saison läuft vom 1. Oktober bis 30. September
 */

// Konstanten
const SEASON_START = new Date('2024-10-01T00:00:00'); // Saisonbeginn 2024/2025
const SEASON_END = new Date('2025-09-30T23:59:59');   // Saisonende 2024/2025
const CURRENT_SEASON = '2024/2025';
const DEBUG = false; // Reduziere Debug-Output für Production

/**
 * Hauptfunktion: Berechnet Badges für alle Vereinsmitglieder
 */
export async function calculateClubBadges(clubId = 1281) {
    console.log('🏅 Badge Calculator V2 - Start');
    console.log(`   Saison: ${CURRENT_SEASON} (${SEASON_START.toLocaleDateString()} - ${SEASON_END.toLocaleDateString()})`);
    console.log('================================');

    try {
        // Schritt 1: Lade alle User des Vereins
        console.log('\n📋 Schritt 1: Lade Vereinsmitglieder...');
        const members = await loadClubMembers(clubId);
        console.log(`✅ ${members.length} Mitglieder gefunden`);

        // Verarbeite jeden User
        const results = [];
        const batchSize = 3; // Parallel-Verarbeitung limitieren

        for (let i = 0; i < members.length; i += batchSize) {
            const batch = members.slice(i, i + batchSize);

            const batchResults = await Promise.all(
                batch.map(member => calculateUserSeasonBadges(member.id, member.name))
            );

            results.push(...batchResults);

            console.log(`Fortschritt: ${Math.min(i + batchSize, members.length)}/${members.length} Piloten`);
        }

        // Zusammenfassung
        const totalBadges = results.reduce((sum, r) => sum + r.seasonBadgeCount, 0);
        const pilotsWithBadges = results.filter(r => r.seasonBadgeCount > 0).length;

        console.log('\n✅ Berechnung abgeschlossen!');
        console.log(`📊 Gesamt: ${totalBadges} Badges bei ${pilotsWithBadges} Piloten`);

        return results;

    } catch (error) {
        console.error('❌ Fehler:', error);
        throw error;
    }
}

/**
 * Berechnet Season-Badges für einen einzelnen User
 * @param {number} userId - User ID
 * @param {string} userName - User Name
 * @param {Array} historicalFlights - Bereits geladene historische Flüge des Users
 * @param {Array} currentSeasonFlights - Optional: Aktuelle Saison-Flüge
 */
export async function calculateUserSeasonBadges(userId, userName, historicalFlights = null, currentSeasonFlights = null) {
    console.log(`\n👤 Verarbeite ${userName} (ID: ${userId})`);

    try {
        let flightsForBadgeHistory;
        let seasonFlightCount = 0;

        // Nutze übergebene historische Flüge für Badge-Historie
        if (historicalFlights && Array.isArray(historicalFlights) && historicalFlights.length > 0) {
            console.log(`  ✅ Nutze ${historicalFlights.length} übergebene historische Flüge`);
            flightsForBadgeHistory = historicalFlights;

            // Validiere Zeitbereich
            const dates = historicalFlights
                .map(f => new Date(f.scoring_date || f.takeoff_time))
                .filter(d => !isNaN(d))
                .sort((a, b) => a - b);

            if (dates.length > 0) {
                const oldestDate = dates[0];
                const newestDate = dates[dates.length - 1];
                console.log(`  📅 Historische Flüge: ${oldestDate.toLocaleDateString()} bis ${newestDate.toLocaleDateString()}`);

                // Prüfe ob genug Historie vorhanden
                const requiredDate = new Date('2023-07-01');
                if (oldestDate > requiredDate) {
                    console.warn(`  ⚠️ Historische Flüge reichen nur bis ${oldestDate.toLocaleDateString()}`);
                    console.warn(`    Empfohlen: Flüge ab ${requiredDate.toLocaleDateString()} für vollständige Badge-Verifizierung`);
                }
            }
        } else {
            // Fallback: Lade historische Flüge selbst
            console.warn('  ⚠️ Keine historischen Flüge übergeben - lade selbst...');
            flightsForBadgeHistory = await loadHistoricalFlights(userId);
        }

        // Zähle aktuelle Saison-Flüge wenn übergeben
        if (currentSeasonFlights && Array.isArray(currentSeasonFlights)) {
            seasonFlightCount = currentSeasonFlights.length;
            console.log(`  ✈️ ${seasonFlightCount} Flüge in aktueller Saison`);
        }

        // Lade Achievements
        console.log('  🏅 Lade Achievements...');
        const achievements = await loadUserAchievements(userId);

        // Filtere nur Badges ab 01.10.2024 (Saisonbeginn)
        const seasonBadges = achievements.filter(badge => {
            const createdDate = new Date(badge.created);
            return createdDate >= SEASON_START && createdDate <= SEASON_END;
        });

        console.log(`  → ${achievements.length} Badges gesamt`);
        console.log(`  → ${seasonBadges.length} Badges in Saison ${CURRENT_SEASON}`);

        // Schritt 4: Evaluiere Multi-Level Badges
        const multiLevelBadges = seasonBadges.filter(badge => badge.points > 1);
        const singleLevelBadges = seasonBadges.filter(badge => badge.points <= 1);

        console.log(`  → ${multiLevelBadges.length} Multi-Level Badges (points > 1)`);
        console.log(`  → ${singleLevelBadges.length} Single-Level Badges`);

        // Schritt 5 & 6: Verarbeite Multi-Level Badges
        const processedBadges = [];

        // Single-Level Badges zählen direkt
        singleLevelBadges.forEach(badge => {
            processedBadges.push({
                ...badge,
                seasonPoints: 1,
                verified: true,
                type: 'single-level',
                foundPreSeason: false,
                preSeasonPoints: 0
            });
        });

        // Multi-Level Badges verifizieren - NUR in historischen Flügen suchen
        for (const badge of multiLevelBadges) {
            const result = await verifyMultiLevelBadgeWithHistory(badge, flightsForBadgeHistory, userId);
            processedBadges.push(result);
        }

        // Statistiken berechnen
        const stats = calculateBadgeStatistics(processedBadges);

        // Ergebnis zusammenstellen
        const totalSeasonPoints = processedBadges.reduce((sum, b) => sum + b.seasonPoints, 0);

        console.log(`  ✅ ${userName}: ${totalSeasonPoints} Season-Punkte`);

        return {
            userId,
            userName,
            // Hauptergebnisse
            badges: processedBadges,
            seasonBadges: processedBadges,
            badgeCount: totalSeasonPoints,
            seasonBadgeCount: totalSeasonPoints,
            badgeCategoryCount: new Set(processedBadges.map(b => b.badge_id)).size,

            // Details
            totalBadges: achievements.length,
            seasonBadgesCount: seasonBadges.length,
            multiLevelCount: multiLevelBadges.length,
            singleLevelCount: singleLevelBadges.length,
            multiLevelBadgeCount: multiLevelBadges.length,

            // Flug-Statistiken
            flightsAnalyzed: flightsForBadgeHistory.length,
            flightsInSeason: seasonFlightCount,
            flightsWithBadges: processedBadges.length > 0 ? seasonBadges.length : 0,

            // Badge-Statistiken
            badgeStats: stats,
            stats: stats, // Für Kompatibilität

            // Weitere erwartete Eigenschaften
            verifiedBadgeCount: processedBadges.filter(b => b.verified).length,
            allTimeBadges: achievements,
            allTimeBadgeCount: achievements.length,
            priorSeasonCount: achievements.length - seasonBadges.length,

            // Zusätzliche Eigenschaften für Kompatibilität
            firstTimeTypes: stats.firstTimeTypes,
            repeatedTypes: stats.repeatedTypes,
            multipleOccurrences: stats.multipleOccurrences,

            // Für Kompatibilität mit loadPilotBadgesWithYearVerification
            currentYearBadges: processedBadges,
            verifiedCount: processedBadges.filter(b => b.verified).length,
            categoryCount: new Set(processedBadges.map(b => b.badge_id)).size
        };

    } catch (error) {
        console.error(`  ❌ Fehler bei ${userName}:`, error.message);
        return createEmptyResult(userId, userName);
    }
}

/**
 * Berechnet Badge-Statistiken
 */
function calculateBadgeStatistics(processedBadges) {
    const stats = {
        firstTimeTypes: 0,
        repeatedTypes: 0,
        multipleOccurrences: 0,
        badgesByMonth: {},
        topBadges: []
    };

    // Zähle erste und wiederholte Badge-Typen
    const firstTimeBadges = processedBadges.filter(b => !b.foundPreSeason);
    const repeatedBadges = processedBadges.filter(b => b.foundPreSeason);

    stats.firstTimeTypes = new Set(firstTimeBadges.map(b => b.badge_id)).size;
    stats.repeatedTypes = new Set(repeatedBadges.map(b => b.badge_id)).size;
    stats.multipleOccurrences = processedBadges.filter(b => b.seasonPoints > 1).length;

    // Badges nach Monat gruppieren
    processedBadges.forEach(badge => {
        const date = new Date(badge.created);
        const monthKey = `${date.toLocaleString('de-DE', { month: 'long' })} ${date.getFullYear()}`;
        stats.badgesByMonth[monthKey] = (stats.badgesByMonth[monthKey] || 0) + badge.seasonPoints;
    });

    // Top Badges berechnen
    const badgeTypeCount = {};
    processedBadges.forEach(badge => {
        const name = badge.name || badge.badge_id;
        badgeTypeCount[name] = (badgeTypeCount[name] || 0) + badge.seasonPoints;
    });

    stats.topBadges = Object.entries(badgeTypeCount)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return stats;
}

/**
 * Lädt alle Vereinsmitglieder
 */
async function loadClubMembers(clubId) {
    const response = await fetch(`/api/proxy?path=club/${clubId}&contest=free`);

    if (!response.ok) {
        throw new Error(`Club-API Fehler: ${response.status}`);
    }

    const data = await response.json();

    if (!data.user || !Array.isArray(data.user)) {
        throw new Error('Keine Mitgliederdaten gefunden');
    }

    return data.user;
}

/**
 * Lädt historische Flüge eines Users (vor Saisonbeginn)
 * Nur als Fallback wenn keine Flüge übergeben wurden
 */
async function loadHistoricalFlights(userId) {
    const allFlights = [];
    const endDate = new Date(SEASON_START);
    endDate.setDate(endDate.getDate() - 1); // Tag vor Saisonbeginn

    console.log(`    📅 Lade historische Flüge bis ${endDate.toLocaleDateString()}...`);

    // Lade die letzten 2-3 Jahre für Badge-Historie
    const currentYear = new Date().getFullYear();
    const yearsToLoad = [currentYear - 1, currentYear - 2, currentYear - 3];

    for (const year of yearsToLoad) {
        try {
            const params = new URLSearchParams({
                path: 'flight',
                user_id_in: userId,
                season_in: year,
                limit: '100'
            });

            const response = await fetch(`/api/proxy?${params}`);

            if (response.ok) {
                const flights = await response.json();

                if (Array.isArray(flights)) {
                    // Filtere nur Flüge vor Saisonbeginn
                    const historicalFlights = flights.filter(flight => {
                        const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
                        return flightDate < SEASON_START;
                    });

                    allFlights.push(...historicalFlights);
                    console.log(`      Jahr ${year}: ${historicalFlights.length} historische Flüge`);
                }
            }
        } catch (error) {
            console.warn(`      ⚠️ Fehler beim Laden von Jahr ${year}:`, error.message);
        }
    }

    // Sortiere chronologisch absteigend (neueste zuerst)
    const sortedFlights = allFlights.sort((a, b) =>
        new Date(b.scoring_date || b.takeoff_time) - new Date(a.scoring_date || a.takeoff_time)
    );

    console.log(`    → ${sortedFlights.length} historische Flüge geladen`);

    return sortedFlights;
}

/**
 * Lädt User Achievements
 */
async function loadUserAchievements(userId) {
    try {
        const response = await fetch(`/api/proxy?path=achievement/user/${userId}`);

        if (!response.ok) {
            throw new Error(`Achievement-API Fehler: ${response.status}`);
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.warn(`  ⚠️ Konnte Achievements nicht laden:`, error.message);
        return [];
    }
}

/**
 * Alternative: Lade Badge-Historie direkt von der API
 */
async function loadBadgeHistory(userId, badgeId) {
    try {
        // Lade alle Achievements des Users
        const response = await fetch(`/api/proxy?path=achievement/user/${userId}`);

        if (!response.ok) {
            throw new Error(`Achievement-Historie nicht verfügbar`);
        }

        const allAchievements = await response.json();

        // Filtere nach badge_id und sortiere nach Datum
        const badgeHistory = allAchievements
            .filter(a => a.badge_id === badgeId)
            .sort((a, b) => new Date(a.created) - new Date(b.created));

        console.log(`      📜 Badge-Historie für ${badgeId}: ${badgeHistory.length} Einträge`);

        return badgeHistory;

    } catch (error) {
        console.warn(`      ⚠️ Konnte Badge-Historie nicht laden:`, error.message);
        return [];
    }
}

/**
 * Verbesserte Version mit Badge-Historie
 */
async function verifyMultiLevelBadgeWithHistory(badge, historicalFlights, userId) {
    console.log(`    🔍 Verifiziere ${badge.badge_id} (${badge.points} Punkte)`);

    // Versuche zuerst die Badge-Historie zu laden
    const badgeHistory = await loadBadgeHistory(userId, badge.badge_id);

    if (badgeHistory.length > 1) {
        // Wir haben eine Historie!
        const preSeasonBadges = badgeHistory.filter(b =>
            new Date(b.created) < SEASON_START
        );

        if (preSeasonBadges.length > 0) {
            // Nehme das letzte Badge vor Season-Start
            const lastPreSeasonBadge = preSeasonBadges[preSeasonBadges.length - 1];
            const preSeasonPoints = lastPreSeasonBadge.points || 0;
            const seasonPoints = Math.max(0, badge.points - preSeasonPoints);

            console.log(`      ✅ Aus Badge-Historie: ${preSeasonPoints} → ${badge.points} Punkte`);
            console.log(`      → Season-Punkte: ${seasonPoints}`);

            return {
                ...badge,
                seasonPoints,
                preSeasonPoints,
                foundPreSeason: true,
                verified: true,
                type: 'multi-level',
                verificationMethod: 'badge-history',
                historyCount: badgeHistory.length
            };
        }
    }

    // Fallback auf Flug-Durchsuchung
    return verifyMultiLevelBadge(badge, historicalFlights, userId);
}

/**
 * Verifiziert Multi-Level Badge durch historische Flüge
 */
async function verifyMultiLevelBadge(badge, historicalFlights, userId) {
    console.log(`    🔍 Verifiziere ${badge.badge_id} durch Flug-Historie`);

    let preSeasonPoints = 0;
    let foundPreSeason = false;
    let foundInFlight = null;

    // Durchsuche NUR historische Flüge (vor Season-Start)
    let flightsChecked = 0;
    let flightsWithDetails = 0;
    const maxFlightsToCheck = 150;

    for (const flight of historicalFlights) {
        const flightDate = new Date(flight.scoring_date || flight.takeoff_time);

        // Sicherheitscheck: Überspringe Flüge ab Season-Start
        if (flightDate >= SEASON_START) {
            if (DEBUG) {
                console.log(`      ⚠️ Überspringe Flug vom ${flightDate.toLocaleDateString()} (nach Season-Start)`);
            }
            continue;
        }

        flightsChecked++;

        // Abbruch wenn zu viele Flüge geprüft wurden
        if (flightsChecked > maxFlightsToCheck && !foundPreSeason) {
            console.log(`      ⏸️ Suche nach ${flightsChecked} Flügen beendet (Limit: ${maxFlightsToCheck})`);
            break;
        }

        try {
            // Lade Flugdetails
            const flightDetails = await loadFlightDetails(flight.id);

            if (!flightDetails) {
                continue;
            }

            flightsWithDetails++;

            // Debug: Zeige Struktur der Flugdetails beim ersten Mal
            if (flightsWithDetails === 1 && DEBUG) {
                console.log(`      📋 Flugdetails-Struktur:`, {
                    hasAchievements: !!flightDetails.achievements,
                    hasAchievement: !!flightDetails.achievement,
                    keys: Object.keys(flightDetails).slice(0, 15)
                });
            }

            // Prüfe verschiedene mögliche Locations für Achievements
            let achievements = null;

            // Option 1: achievement (Singular) direkt im Objekt - PRIMÄR!
            if (flightDetails.achievement) {
                // Könnte ein Array oder ein einzelnes Objekt sein
                if (Array.isArray(flightDetails.achievement)) {
                    achievements = flightDetails.achievement;
                } else if (typeof flightDetails.achievement === 'object') {
                    achievements = [flightDetails.achievement];
                }
            }
            // Option 2: achievements (Plural) als Fallback
            else if (flightDetails.achievements && Array.isArray(flightDetails.achievements)) {
                achievements = flightDetails.achievements;
            }

            if (!achievements || achievements.length === 0) {
                continue;
            }

            // Suche nach diesem Badge in den Achievements
            const achievement = achievements.find(a => {
                // Direkte badge_id Übereinstimmung (primär)
                if (a.badge_id === badge.badge_id) return true;

                // Weitere Möglichkeiten der badge_id
                if (a.badge === badge.badge_id) return true;
                if (a.badge && typeof a.badge === 'object' && a.badge.id === badge.badge_id) return true;
                if (a.id === badge.badge_id) return true;

                return false;
            });

            if (achievement) {
                // Badge in Vergangenheit gefunden!
                preSeasonPoints = achievement.points || 0;

                // Falls points ein Array ist (aus badge.points), nehme den höchsten Wert
                if (achievement.badge && achievement.badge.points && Array.isArray(achievement.badge.points)) {
                    const currentPoints = achievement.points || 1;
                    preSeasonPoints = currentPoints;
                }

                foundPreSeason = true;
                foundInFlight = {
                    id: flight.id,
                    date: flightDate,
                    points: preSeasonPoints,
                    achievementId: achievement.id,
                    badgeId: achievement.badge_id
                };

                console.log(`      ✅ Gefunden in Flug vom ${flightDate.toLocaleDateString()}: ${preSeasonPoints} Punkte`);
                console.log(`      📎 Flug-ID: ${flight.id}, Achievement-ID: ${achievement.id}`);
                if (DEBUG) {
                    console.log(`      📋 Achievement Details:`, {
                        badge_id: achievement.badge_id,
                        points: achievement.points,
                        name: achievement.badge?.name
                    });
                }
                break;
            }

        } catch (error) {
            if (DEBUG && flightsChecked <= 3) {
                console.error(`      ❌ Fehler bei Flug ${flight.id}:`, error.message);
            }
            continue;
        }

        // Kleine Pause nach jedem 5. Flug für Rate Limiting
        if (flightsChecked % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // Debug-Zusammenfassung
    if (DEBUG) {
        console.log(`      📊 ${flightsChecked} Flüge geprüft, ${flightsWithDetails} mit Details geladen`);
    }

    // Berechne Season-Punkte
    const seasonPoints = Math.max(0, badge.points - preSeasonPoints);

    if (foundPreSeason) {
        console.log(`      → Alte Punkte: ${preSeasonPoints}, Neue Punkte: ${badge.points}`);
        console.log(`      → Season-Punkte: ${seasonPoints}`);
    } else {
        console.log(`      → Nicht in Historie gefunden - alle ${badge.points} Punkte zählen für Season`);
    }

    return {
        ...badge,
        seasonPoints,
        preSeasonPoints,
        foundPreSeason,
        foundInFlight,
        verified: true,
        type: 'multi-level',
        verificationMethod: foundPreSeason ? 'flight-search' : 'first-time',
        flightsChecked,
        flightsWithDetails
    };
}

/**
 * Lädt Flugdetails mit Cache und Retry-Logik
 */
const flightDetailsCache = new Map();
let failedFlightIds = new Set(); // Track dauerhaft fehlgeschlagene IDs

async function loadFlightDetails(flightId) {
    if (!flightId) return null;

    // Überspringe bekannte Fehler
    if (failedFlightIds.has(flightId)) {
        return null;
    }

    // Cache prüfen
    if (flightDetailsCache.has(flightId)) {
        return flightDetailsCache.get(flightId);
    }

    try {
        // Verwende den korrekten flightdetail Pfad
        const response = await fetch(`/api/proxy?path=flightdetail/${flightId}`);

        if (!response.ok) {
            if (response.status === 404) {
                // Flug existiert nicht mehr - permanent markieren
                failedFlightIds.add(flightId);
            }
            throw new Error(`Flugdetails nicht verfügbar: ${response.status}`);
        }

        const details = await response.json();

        // In Cache speichern
        flightDetailsCache.set(flightId, details);

        return details;
    } catch (error) {
        if (DEBUG && flightDetailsCache.size < 10) {
            console.warn(`      ⚠️ Konnte Flug ${flightId} nicht laden:`, error.message);
        }

        // Bei wiederholten Fehlern ID merken
        if (error.message.includes('404')) {
            failedFlightIds.add(flightId);
        }

        return null;
    }
}

/**
 * Erstellt ein leeres Ergebnis
 */
function createEmptyResult(userId, userName) {
    const emptyStats = {
        firstTimeTypes: 0,
        repeatedTypes: 0,
        multipleOccurrences: 0,
        badgesByMonth: {},
        topBadges: []
    };

    return {
        userId,
        userName,
        badges: [],
        seasonBadges: [],
        badgeCount: 0,
        seasonBadgeCount: 0,
        badgeCategoryCount: 0,
        totalBadges: 0,
        seasonBadgesCount: 0,
        multiLevelCount: 0,
        singleLevelCount: 0,
        multiLevelBadgeCount: 0,
        flightsAnalyzed: 0,
        flightsInSeason: 0,
        flightsWithBadges: 0,
        verifiedBadgeCount: 0,
        allTimeBadges: [],
        allTimeBadgeCount: 0,
        priorSeasonCount: 0,
        // Stats
        badgeStats: emptyStats,
        stats: emptyStats,
        firstTimeTypes: 0,
        repeatedTypes: 0,
        multipleOccurrences: 0,
        // Kompatibilität
        currentYearBadges: [],
        verifiedCount: 0,
        categoryCount: 0
    };
}

/**
 * Debug-Funktion für detaillierte Badge-Analyse
 */
export function debugBadgeAnalysis(result) {
    console.log('\n🔍 BADGE-ANALYSE:');
    console.log('═══════════════════════════════════════════');
    console.log(`Pilot: ${result.userName} (ID: ${result.userId})`);
    console.log(`Saison: ${CURRENT_SEASON}`);
    console.log(`\nÜbersicht:`);
    console.log(`  • ${result.totalBadges} Badges gesamt`);
    console.log(`  • ${result.seasonBadgesCount} Badges ab ${SEASON_START.toLocaleDateString()}`);
    console.log(`  • ${result.seasonBadgeCount} Season-Punkte berechnet`);
    console.log(`\nBadge-Typen:`);
    console.log(`  • ${result.singleLevelCount} Single-Level (je 1 Punkt)`);
    console.log(`  • ${result.multiLevelCount} Multi-Level (verifiziert)`);
    console.log(`\nFlug-Analyse:`);
    console.log(`  • ${result.flightsAnalyzed} historische Flüge durchsucht`);
    console.log(`  • ${result.flightsInSeason} Flüge in aktueller Saison`);

    if (result.badges && result.badges.length > 0) {
        console.log(`\nTop Badges:`);
        const topBadges = [...result.badges]
            .sort((a, b) => b.seasonPoints - a.seasonPoints)
            .slice(0, 5);

        topBadges.forEach((badge, i) => {
            console.log(`  ${i + 1}. ${badge.badge_id}: ${badge.seasonPoints} Punkte`);
            if (badge.foundPreSeason) {
                console.log(`     (${badge.points} total - ${badge.preSeasonPoints} pre-season)`);
            }
        });
    }

    console.log('═══════════════════════════════════════════\n');
}

// Debug-Funktion zum Testen
window.testBadgeVerification = async function (userId, badgeId) {
    console.log(`\n🧪 Teste Badge-Verifikation für User ${userId}, Badge ${badgeId}`);

    // Lade historische Flüge
    const flights = await loadHistoricalFlights(userId);
    const oldFlight = flights.find(f => new Date(f.scoring_date) < SEASON_START);

    if (oldFlight) {
        console.log(`\nTeste mit Flug ${oldFlight.id} vom ${new Date(oldFlight.scoring_date).toLocaleDateString()}`);
        const details = await loadFlightDetails(oldFlight.id);
        console.log('Flugdetails:', details);
        console.log('Achievements:', details?.achievements || details?.achievement || 'KEINE ACHIEVEMENTS GEFUNDEN');
    }

    // Teste Badge-Historie
    const history = await loadBadgeHistory(userId, badgeId);
    console.log('\nBadge-Historie:', history);

    return { flights: flights.length, history: history.length };
};

// Debug-Funktion um die Achievement-Struktur zu analysieren
window.debugAchievementStructure = async function (flightId) {
    console.log(`\n🔍 Analysiere Achievement-Struktur für Flug ${flightId}`);

    const response = await fetch(`/api/proxy?path=flightdetail/${flightId}`);
    const flight = await response.json();

    console.log('\n1. Top-Level Keys:', Object.keys(flight));

    // Prüfe alle möglichen Achievement-Locations
    const locations = [
        'achievement',
        'achievements',
        'flight.achievement',
        'flight.achievements',
        'data.achievement',
        'data.achievements'
    ];

    locations.forEach(path => {
        const parts = path.split('.');
        let current = flight;

        for (const part of parts) {
            if (current && current[part]) {
                current = current[part];
            } else {
                current = null;
                break;
            }
        }

        if (current) {
            console.log(`\n✅ Gefunden bei "${path}":`, {
                type: Array.isArray(current) ? 'Array' : typeof current,
                count: Array.isArray(current) ? current.length : 1,
                data: current
            });
        }
    });

    return flight;
};

// Hilfsfunktion: Bestimmt die Saison für ein Datum
window.getSeasonForDate = function(dateString) {
    if (!dateString) return 'Unbekannt';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    if (month >= 10) {
        return `${year}/${year + 1}`;
    } else {
        return `${year - 1}/${year}`;
    }
};

// Export
export default {
    calculateClubBadges,
    calculateUserSeasonBadges,
    debugBadgeAnalysis
};