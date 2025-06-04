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
        type: 'single-level'
      });
    });
    
    // Multi-Level Badges verifizieren
    for (const badge of multiLevelBadges) {
      const result = await verifyMultiLevelBadge(badge, flights, userId);
      processedBadges.push(result);
    }
    
    // Ergebnis zusammenstellen
    const totalSeasonPoints = processedBadges.reduce((sum, b) => sum + b.seasonPoints, 0);
    
    console.log(`  ✅ ${userName}: ${totalSeasonPoints} Season-Punkte`);
    
    return {
      userId,
      userName,
      // Hauptergebnisse
      badges: processedBadges,
      badgeCount: totalSeasonPoints,
      seasonBadgeCount: totalSeasonPoints,
      badgeCategoryCount: new Set(processedBadges.map(b => b.badge_id)).size,
      
      // Details
      totalBadges: achievements.length,
      seasonBadges: seasonBadges.length,
      multiLevelCount: multiLevelBadges.length,
      singleLevelCount: singleLevelBadges.length,
      
      // Flug-Statistiken
      flightsAnalyzed: flights.length,
      flightsInSeason: flights.filter(f => new Date(f.scoring_date) >= SEASON_START).length
    };
    
  } catch (error) {
    console.error(`  ❌ Fehler bei ${userName}:`, error.message);
    return createEmptyResult(userId, userName);
  }
}

/**
 * Lädt alle Vereinsmitglieder
 */
async function loadClubMembers(clubId) {
  const response = await fetch(`/api/club/${clubId}`);
  
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
 * Nutzt die Vercel API-Endpunkte
 */
async function loadUserFlightsAdaptive(userId) {
  const allFlights = [];
  const startDate = new Date('2023-07-01');
  const endDate = new Date('2024-09-30'); // Bis Tag vor Saisonbeginn
  
  console.log(`  📅 Lade Flüge adaptiv...`);
  
  // Hilfsfunktion für API-Calls
  async function fetchFlights(params) {
    // Verwende den club-flights-complete Endpunkt für bessere Performance
    const url = `/api/club-flights-complete?` + new URLSearchParams({
      startDate: params.from,
      endDate: params.to,
      userId: userId // Filtern wir später lokal
    });
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API Fehler: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Filtere nur Flüge dieses Users
      if (data.flights && Array.isArray(data.flights)) {
        return data.flights.filter(f => f.user && f.user.id === parseInt(userId));
      }
      
      return [];
    } catch (error) {
      // Fallback auf Jahr-basiertes Loading
      console.warn('    ⚠️ Club-flights Fehler, versuche alternatives Loading...');
      return await loadFlightsByYear(userId, params.from, params.to);
    }
  }
  
  // Alternative: Lade Flüge Jahr für Jahr
  async function loadFlightsByYear(userId, fromDate, toDate) {
    const flights = [];
    const startYear = new Date(fromDate).getFullYear();
    const endYear = new Date(toDate).getFullYear();
    
    for (let year = startYear; year <= endYear; year++) {
      try {
        const response = await fetch(`/api/flights?user_id_in=${userId}&season_in=${year}&limit=100`);
        
        if (response.ok) {
          const yearFlights = await response.json();
          if (Array.isArray(yearFlights)) {
            // Filtere nach Datum
            const filtered = yearFlights.filter(f => {
              const date = new Date(f.scoring_date || f.takeoff_time);
              return date >= new Date(fromDate) && date <= new Date(toDate);
            });
            flights.push(...filtered);
          }
        }
      } catch (error) {
        console.warn(`    ⚠️ Fehler beim Laden von Jahr ${year}:`, error.message);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return flights;
  }
  
  // Rekursive Funktion zum Laden mit Zeitbereichs-Teilung
  async function loadFlightsInRange(fromDate, toDate, depth = 0) {
    const from = fromDate.toISOString().split('T')[0];
    const to = toDate.toISOString().split('T')[0];
    
    try {
      const flights = await fetchFlights({ from, to });
      
      if (DEBUG) {
        const indent = '  '.repeat(depth);
        console.log(`    ${indent}${from} bis ${to}: ${flights.length} Flüge`);
      }
      
      // Wenn genau 100 Flüge = möglicherweise Limit erreicht
      if (flights.length >= 100) {
        if (DEBUG) {
          console.log(`    ${'  '.repeat(depth)}⚠️ Viele Flüge - teile Zeitbereich zur Sicherheit`);
        }
        
        // Berechne Anzahl der Tage im Bereich
        const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));
        
        // Nur teilen wenn mehr als 7 Tage
        if (daysDiff > 7) {
          // Teile in 2 Hälften
          const midDate = new Date(fromDate);
          midDate.setDate(midDate.getDate() + Math.floor(daysDiff / 2));
          
          // Lade beide Hälften
          await loadFlightsInRange(fromDate, midDate, depth + 1);
          await loadFlightsInRange(new Date(midDate.getTime() + 86400000), toDate, depth + 1);
          
          return; // Wichtig: Return hier
        }
      }
      
      // Füge Flüge zur Gesamtliste hinzu
      allFlights.push(...flights);
      
    } catch (error) {
      console.error(`    ❌ Fehler beim Laden (${from} - ${to}):`, error.message);
      
      // Bei Fehler: Versuche Jahr-weises Loading als Fallback
      const flights = await loadFlightsByYear(userId, from, to);
      allFlights.push(...flights);
    }
  }
  
  // Starte den Ladevorgang
  await loadFlightsInRange(startDate, endDate);
  
  // Lade zusätzlich aktuelle Saison-Flüge
  try {
    const currentYear = new Date().getFullYear();
    const response = await fetch(`/api/flights?user_id_in=${userId}&season_in=${currentYear}&limit=100`);
    
    if (response.ok) {
      const seasonFlights = await response.json();
      if (Array.isArray(seasonFlights)) {
        const filtered = seasonFlights.filter(f => {
          const date = new Date(f.scoring_date || f.takeoff_time);
          return date >= SEASON_START;
        });
        
        allFlights.push(...filtered);
        if (DEBUG && filtered.length > 0) {
          console.log(`    Saison 24/25: ${filtered.length} Flüge`);
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
  
  console.log(`  → ${sortedFlights.length} Flüge insgesamt geladen`);
  
  return sortedFlights;
}

/**
 * Lädt User Achievements
 */
async function loadUserAchievements(userId) {
  const response = await fetch(`/api/achievements/${userId}`);
  
  if (!response.ok) {
    throw new Error(`Achievement-API Fehler: ${response.status}`);
  }
  
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Verifiziert Multi-Level Badge durch Flug-Historie
 */
async function verifyMultiLevelBadge(badge, flights, userId) {
  console.log(`    🔍 Verifiziere ${badge.badge_id} (${badge.points} Punkte)`);
  
  let preSeasonPoints = 0;
  let foundPreSeason = false;
  
  // Durchsuche Flüge vor Season-Start
  for (const flight of flights) {
    const flightDate = new Date(flight.scoring_date || flight.takeoff_time);
    
    // Nur Flüge vor Season-Start prüfen
    if (flightDate >= SEASON_START) continue;
    
    try {
      // Lade Flugdetails
      const flightDetails = await loadFlightDetails(flight.id);
      
      if (!flightDetails || !flightDetails.achievements) continue;
      
      // Suche nach diesem Badge in den Achievements
      const achievement = flightDetails.achievements.find(
        a => a.badge_id === badge.badge_id
      );
      
      if (achievement) {
        // Badge in Vergangenheit gefunden!
        preSeasonPoints = achievement.points || 0;
        foundPreSeason = true;
        
        console.log(`      ✓ Gefunden in Flug vom ${flightDate.toLocaleDateString()}: ${preSeasonPoints} Punkte`);
        break; // Stoppe bei erstem Fund
      }
    } catch (error) {
      // Fehler ignorieren, weiter mit nächstem Flug
      continue;
    }
  }
  
  // Berechne Season-Punkte
  const seasonPoints = Math.max(0, badge.points - preSeasonPoints);
  
  if (foundPreSeason) {
    console.log(`      → Alte Punkte: ${preSeasonPoints}, Neue Punkte: ${badge.points}`);
    console.log(`      → Season-Punkte: ${seasonPoints}`);
    if (seasonPoints <= 0) {
      console.log(`      → Badge ${badge.badge_id} ist nicht mehr gültig in dieser Saison`);
      return null; // Badge nicht mehr gültig
    }
  } else {
    console.log(`      → Erstmalig in Saison 24/25 erreicht: ${seasonPoints} Punkte`);
  }
  
  return {
    ...badge,
    seasonPoints,
    preSeasonPoints,
    foundPreSeason,
    verified: true,
    type: 'multi-level',
    verificationMethod: foundPreSeason ? 'historical-search' : 'first-time'
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
    const response = await fetch(`/api/flightdetail/${flightId}`);
    
    if (!response.ok) {
      throw new Error(`Flugdetails nicht verfügbar: ${response.status}`);
    }
    
    const details = await response.json();
    
    // In Cache speichern
    flightDetailsCache.set(flightId, details);
    
    return details;
  } catch (error) {
    if (DEBUG) {
      console.warn(`      ⚠️ Konnte Flug ${flightId} nicht laden:`, error.message);
    }
    return null;
  }
}

/**
 * Erstellt ein leeres Ergebnis
 */
function createEmptyResult(userId, userName) {
  return {
    userId,
    userName,
    badges: [],
    badgeCount: 0,
    seasonBadgeCount: 0,
    badgeCategoryCount: 0,
    totalBadges: 0,
    seasonBadges: 0,
    multiLevelCount: 0,
    singleLevelCount: 0,
    flightsAnalyzed: 0,
    flightsInSeason: 0
  };
}

/**
 * Debug-Funktion für detaillierte Badge-Analyse
 */
export function debugBadgeAnalysis(result) {
  console.log('\n🔍 BADGE-ANALYSE:');
  console.log('═══════════════════════════════════════');
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
  
  console.log('═══════════════════════════════════════\n');
}

// Export
export default {
  calculateClubBadges,
  calculateUserSeasonBadges,
  debugBadgeAnalysis
};