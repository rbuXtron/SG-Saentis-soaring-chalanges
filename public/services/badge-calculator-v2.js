/**
 * SG Säntis Cup - Badge Calculator V2
 * 
 * Implementiert den exakten Algorithmus:
 * 1. Lade alle User eines Vereins
 * 2. Lade alle Flüge blockweise monatlich bis Juni 2023
 * 3. Lade Badges jünger als 30.09.2024
 * 4. Evaluiere Multi-Level Badges (points > 1)
 * 5. Durchsuche ältere Flüge für Badge-Historie
 * 6. Ziehe gefundene Punkte ab
 */

// Konstanten
const SEASON_START = new Date('2024-10-01T00:00:00'); // Nur Badges ab diesem Datum zählen
const SEASON_END = new Date('2025-09-30T23:59:59');
const FLIGHTS_START = new Date('2023-06-01');
const DEBUG = true;

/**
 * Hauptfunktion: Berechnet Badges für alle Vereinsmitglieder
 */
export async function calculateClubBadges(clubId = 1281) {
  console.log('🏅 Badge Calculator V2 - Start');
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
 */
export async function calculateUserSeasonBadges(userId, userName) {
  console.log(`\n👤 Verarbeite ${userName} (ID: ${userId})`);
  
  try {
    // Schritt 2: Lade alle Flüge adaptiv
    console.log('  📅 Lade Flüge...');
    const flights = await loadUserFlightsAdaptive(userId);
    console.log(`  → ${flights.length} Flüge gefunden`);
    
    // Schritt 3: Lade Badges
    console.log('  🏅 Lade Achievements...');
    const achievements = await loadUserAchievements(userId);
    
    // Filtere nur Badges ab 01.10.2024 (Saisonbeginn)
    const seasonBadges = achievements.filter(badge => {
      const createdDate = new Date(badge.created);
      return createdDate >= SEASON_START && createdDate <= SEASON_END;
    });
    
    console.log(`  → ${achievements.length} Badges gesamt`);
    console.log(`  → ${seasonBadges.length} Badges ab ${SEASON_START.toLocaleDateString()}`);
    
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
    
    // Multi-Level Badges verifizieren - mit verbesserter Methode
    for (const badge of multiLevelBadges) {
      const result = await verifyMultiLevelBadgeWithHistory(badge, flights, userId);
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
      seasonBadges: seasonBadges.length,
      multiLevelCount: multiLevelBadges.length,
      singleLevelCount: singleLevelBadges.length,
      multiLevelBadgeCount: multiLevelBadges.length,
      
      // Flug-Statistiken
      flightsAnalyzed: flights.length,
      flightsInSeason: flights.filter(f => new Date(f.scoring_date) >= SEASON_START).length,
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
      multipleOccurrences: stats.multipleOccurrences
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
 * Lädt alle Flüge eines Users mit adaptiver Zeitbereichs-Teilung
 */
async function loadUserFlightsAdaptive(userId) {
  const allFlights = [];
  const startDate = new Date('2023-07-01');
  const endDate = new Date('2024-09-30'); // Bis Tag vor Saisonbeginn
  
  console.log(`  📅 Lade Flüge adaptiv...`);
  
  // Rekursive Funktion zum Laden mit Zeitbereichs-Teilung
  async function loadFlightsInRange(fromDate, toDate, depth = 0) {
    const from = fromDate.toISOString().split('T')[0];
    const to = toDate.toISOString().split('T')[0];
    
    try {
      // Verwende den flights-range Endpunkt
      const params = new URLSearchParams({
        user_id_in: userId,
        date_from: from,
        date_to: to,
        limit: '100'
      });
      
      const response = await fetch(`/api/flights-range?${params}`);
      
      if (!response.ok) {
        throw new Error(`API Fehler: ${response.status}`);
      }
      
      const flights = await response.json();
      
      if (!Array.isArray(flights)) {
        return;
      }
      
      if (DEBUG && depth < 3) { // Begrenze Debug-Output
        const indent = '  '.repeat(depth);
        console.log(`    ${indent}${from} bis ${to}: ${flights.length} Flüge`);
      }
      
      // WICHTIG: Wenn genau 100 Flüge = Limit erreicht, Zeitbereich teilen
      if (flights.length === 100) {
        if (DEBUG && depth < 3) {
          console.log(`    ${'  '.repeat(depth)}⚠️ Limit erreicht - teile Zeitbereich`);
        }
        
        // Berechne Anzahl der Tage im Bereich
        const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));
        
        // Nur teilen wenn mehr als 1 Tag
        if (daysDiff > 1) {
          // Teile in 2 oder 3 Teile basierend auf Bereichsgröße
          const parts = daysDiff > 30 ? 3 : 2;
          const daysPerPart = Math.ceil(daysDiff / parts);
          
          // Lade jeden Teil rekursiv
          for (let i = 0; i < parts; i++) {
            const partStart = new Date(fromDate);
            partStart.setDate(partStart.getDate() + (i * daysPerPart));
            
            const partEnd = new Date(fromDate);
            partEnd.setDate(partEnd.getDate() + ((i + 1) * daysPerPart) - 1);
            
            // Sicherstellen dass partEnd nicht über toDate hinausgeht
            if (partEnd > toDate) {
              partEnd.setTime(toDate.getTime());
            }
            
            // Rekursiver Aufruf für diesen Teil
            await loadFlightsInRange(partStart, partEnd, depth + 1);
            
            // Kurze Pause für Rate Limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          return; // WICHTIG: Return ohne Flüge hinzuzufügen!
        } else {
          // Wenn wir nicht weiter teilen können (nur 1 Tag)
          console.warn(`    ${'  '.repeat(depth)}⚠️ Kann nicht weiter teilen - akzeptiere ${flights.length} Flüge`);
          allFlights.push(...flights);
        }
      } else {
        // Weniger als 100 Flüge = sicher alle geladen
        allFlights.push(...flights);
      }
      
    } catch (error) {
      console.error(`    ❌ Fehler beim Laden (${from} - ${to}):`, error.message);
      
      // Fallback: Lade Jahr für Jahr
      const years = new Set();
      let current = new Date(fromDate);
      while (current <= toDate) {
        years.add(current.getFullYear());
        current.setFullYear(current.getFullYear() + 1);
      }
      
      for (const year of years) {
        try {
          const response = await fetch(`/api/flights?user_id_in=${userId}&season_in=${year}&limit=100`);
          
          if (response.ok) {
            const yearFlights = await response.json();
            if (Array.isArray(yearFlights)) {
              // Filtere nach Datumbereich
              const filtered = yearFlights.filter(f => {
                const date = new Date(f.scoring_date || f.takeoff_time);
                return date >= fromDate && date <= toDate;
              });
              allFlights.push(...filtered);
              console.log(`      Fallback Jahr ${year}: ${filtered.length} Flüge`);
            }
          }
        } catch (err) {
          console.warn(`      Fehler bei Jahr ${year}:`, err.message);
        }
      }
    }
  }
  
  // Starte den Ladevorgang
  await loadFlightsInRange(startDate, endDate);
  
  // Lade zusätzlich aktuelle Saison-Flüge
  try {
    const seasonStart = SEASON_START.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    
    const params = new URLSearchParams({
      user_id_in: userId,
      date_from: seasonStart,
      date_to: today,
      limit: '100'
    });
    
    const response = await fetch(`/api/flights-range?${params}`);
    
    if (response.ok) {
      const seasonFlights = await response.json();
      if (Array.isArray(seasonFlights)) {
        allFlights.push(...seasonFlights);
        if (DEBUG && seasonFlights.length > 0) {
          console.log(`    Saison 24/25: ${seasonFlights.length} Flüge`);
        }
      }
    }
  } catch (error) {
    console.warn(`    ⚠️ Fehler beim Laden der Saison-Flüge:`, error.message);
  }
  
  // Entferne Duplikate
  const uniqueFlights = Array.from(
    new Map(allFlights.map(f => [f.id, f])).values()
  );
  
  // Sortiere chronologisch absteigend (neueste zuerst)
  const sortedFlights = uniqueFlights.sort((a, b) => 
    new Date(b.scoring_date || b.takeoff_time) - new Date(a.scoring_date || a.takeoff_time)
  );
  
  console.log(`  → ${sortedFlights.length} eindeutige Flüge geladen`);
  
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
async function verifyMultiLevelBadgeWithHistory(badge, flights, userId) {
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
  return verifyMultiLevelBadge(badge, flights, userId);
}

/**
 * Verifiziert Multi-Level Badge durch Flug-Historie
 */
async function verifyMultiLevelBadge(badge, flights, userId) {
  console.log(`    🔍 Verifiziere ${badge.badge_id} durch Flug-Historie`);
  
  let preSeasonPoints = 0;
  let foundPreSeason = false;
  let foundInFlight = null;
  
  // Durchsuche Flüge vor Season-Start
  let flightsChecked = 0;
  let flightsWithDetails = 0;
  
  for (const flight of flights) {
    const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
    
    // Nur Flüge vor Season-Start prüfen
    if (flightDate >= SEASON_START) continue;
    
    flightsChecked++;
    
    try {
      // Lade Flugdetails
      const flightDetails = await loadFlightDetails(flight.id);
      
      if (!flightDetails) {
        continue;
      }
      
      flightsWithDetails++;
      
      // Debug: Zeige Struktur der Flugdetails beim ersten Mal
      if (flightsChecked === 1) {
        console.log(`      📋 Flugdetails-Struktur:`, {
          hasAchievements: !!flightDetails.achievements,
          hasAchievement: !!flightDetails.achievement,
          keys: Object.keys(flightDetails).slice(0, 15)
        });
      }
      
      // Prüfe verschiedene mögliche Locations für Achievements
      let achievements = null;
      
      // Option 1: achievements (Plural) direkt im Objekt
      if (flightDetails.achievements && Array.isArray(flightDetails.achievements)) {
        achievements = flightDetails.achievements;
      }
      // Option 2: achievement (Singular) direkt im Objekt
      else if (flightDetails.achievement) {
        // Könnte ein Array oder ein einzelnes Objekt sein
        if (Array.isArray(flightDetails.achievement)) {
          achievements = flightDetails.achievement;
        } else if (typeof flightDetails.achievement === 'object') {
          achievements = [flightDetails.achievement];
        }
      }
      
      if (!achievements || achievements.length === 0) {
        continue;
      }
      
      // Debug: Zeige Achievement-Struktur
      if (flightsWithDetails === 1 && achievements.length > 0) {
        console.log(`      📋 Achievement-Struktur:`, {
          count: achievements.length,
          firstAchievement: achievements[0],
          keys: Object.keys(achievements[0] || {})
        });
      }
      
      // Suche nach diesem Badge in den Achievements
      const achievement = achievements.find(a => {
        // Verschiedene Möglichkeiten der badge_id
        return a.badge_id === badge.badge_id || 
               a.badge === badge.badge_id ||
               (a.badge && a.badge.id === badge.badge_id) ||
               a.id === badge.badge_id;
      });
      
      if (achievement) {
        // Badge in Vergangenheit gefunden!
        preSeasonPoints = achievement.points || achievement.level || achievement.value || 0;
        foundPreSeason = true;
        foundInFlight = {
          id: flight.id,
          date: flightDate,
          points: preSeasonPoints
        };
        
        console.log(`      ✅ Gefunden in Flug vom ${flightDate.toLocaleDateString()}: ${preSeasonPoints} Punkte`);
        console.log(`      📎 Flug-ID: ${flight.id}`);
        console.log(`      📋 Achievement gefunden:`, achievement);
        break;
      }
      
    } catch (error) {
      if (DEBUG && flightsChecked <= 3) {
        console.error(`      ❌ Fehler bei Flug ${flight.id}:`, error.message);
      }
      continue;
    }
    
    // Begrenze die Anzahl der Flüge
    if (flightsChecked >= 50 && !foundPreSeason) {
      console.log(`      ⏸️ Suche nach ${flightsChecked} Flügen beendet`);
      break;
    }
  }
  
  // Debug-Zusammenfassung
  console.log(`      📊 ${flightsChecked} Flüge geprüft, ${flightsWithDetails} mit Details geladen`);
  
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
 * Lädt Flugdetails mit Cache
 */
const flightDetailsCache = new Map();

async function loadFlightDetails(flightId) {
  if (!flightId) return null;
  
  // Cache prüfen
  if (flightDetailsCache.has(flightId)) {
    return flightDetailsCache.get(flightId);
  }
  
  try {
    // Verwende den korrekten flightdetail Pfad
    const response = await fetch(`/api/proxy?path=flightdetail/${flightId}`);
    
    if (!response.ok) {
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
    seasonBadges: 0,
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
    multipleOccurrences: 0
  };
}

/**
 * Debug-Funktion für detaillierte Badge-Analyse
 */
export function debugBadgeAnalysis(result) {
  console.log('\n🔍 BADGE-ANALYSE:');
  console.log('═══════════════════════════════════════════');
  console.log(`Pilot: ${result.userName} (ID: ${result.userId})`);
  console.log(`\nÜbersicht:`);
  console.log(`  • ${result.totalBadges} Badges gesamt`);
  console.log(`  • ${result.seasonBadges} Badges ab 01.10.2024`);
  console.log(`  • ${result.seasonBadgeCount} Season-Punkte berechnet`);
  console.log(`\nBadge-Typen:`);
  console.log(`  • ${result.singleLevelCount} Single-Level (je 1 Punkt)`);
  console.log(`  • ${result.multiLevelCount} Multi-Level (verifiziert)`);
  console.log(`\nFlug-Analyse:`);
  console.log(`  • ${result.flightsAnalyzed} Flüge durchsucht`);
  console.log(`  • ${result.flightsInSeason} Flüge in Saison`);
  
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
window.testBadgeVerification = async function(userId, badgeId) {
  console.log(`\n🧪 Teste Badge-Verifikation für User ${userId}, Badge ${badgeId}`);
  
  // Lade einen Beispiel-Flug
  const flights = await loadUserFlightsAdaptive(userId);
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
window.debugAchievementStructure = async function(flightId) {
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

// Export
export default {
  calculateClubBadges,
  calculateUserSeasonBadges,
  debugBadgeAnalysis
};