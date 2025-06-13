/**
 * SG Säntis Cup - Konstanten und Konfigurationswerte
 * 
 * Diese Datei enthält alle Konfigurationswerte und Konstanten,
 * die an verschiedenen Stellen der Anwendung verwendet werden.
 */

// API-Konfiguration
export const API = {
  BASE_URL: 'https://api.weglide.org',
  ENDPOINTS: {
    CLUB: '/v1/club/5',  // Endpunkt für Club-Daten
    FLIGHTS: '/v1/flights', // Endpunkt für Flüge
    SPRINT: '/v1/sprint',   // Endpunkt für Sprint-Daten
    ACHIEVEMENTS: '/v1/achievements' // Endpunkt für Achievements/Badges
  },
  CACHE: {
    ENABLED: true,
    EXPIRATION_MINUTES: 60  // Cache-Einträge verfallen nach 60 Minuten
  },
  PAGINATION: {
    DEFAULT_LIMIT: 80
  }
};

// Club-Konfiguration
export const CLUB = {
  ID: 1281,
  NAME: 'SG Säntis',
  LOCATION: 'St. Gallen-Altenrhein'
};

/**
 * DMST-Index Daten für Flugzeuge
 * Nur der Index muss gepflegt werden, die Faktoren werden automatisch berechnet
 */
export const AIRCRAFT_DMST_INDEX = {
  "JS1-21": 126,
  "ASH 25E": 122,
  "HpH 304 MS Shark": 119,
  "LS 9": 117,
  "LS 6": 117,
  "DG 800": 118,
  "Discus 2cT 18m": 114,
  "Duo Discus": 112,
  "DG 400": 109,
  "DG 300 WL": 105,
  "DG 300": 104,
  "DG 500": 100,  // Referenz-Flugzeug
  "Libelle": 96,
  "MG 23": 76,
  "HpH 304 CZ": 119,
  "Mg 19": 77,
  "ASH 25 M": 122

};

/**
 * Berechnet die Flugzeugfaktoren aus dem DMST-Index
 * @param {number} dmstIndex - Der DMST-Index des Flugzeugs
 * @returns {Object} - Objekt mit index, factor1 und factor2
 */
function calculateAircraftFactors(dmstIndex) {
  const factor1 = 100 / dmstIndex;
  //const factor2 = Math.pow(100 / dmstIndex, 2);
  const factor2 = factor1 ** 2; 
  
  return {
    index: dmstIndex,
    factor1: factor1,
    factor2: factor2
  };
}

/**
 * Generiert die AIRCRAFT_FACTORS aus den DMST-Indizes
 */
export const AIRCRAFT_FACTORS = Object.entries(AIRCRAFT_DMST_INDEX).reduce((factors, [aircraft, dmstIndex]) => {
  factors[aircraft] = calculateAircraftFactors(dmstIndex);
  console.log(`Flugzeug "${aircraft}" mit DMST-Index ${dmstIndex} hinzugefügt:`, factors[aircraft]);
  return factors;
}, {});

/**
 * Hilfsfunktion: Gibt den Flugzeugfaktor für ein bestimmtes Flugzeug zurück
 * @param {string} aircraftType - Der Flugzeugtyp
 * @returns {number} - Der Flugzeugfaktor (factor2) oder 1.0 als Fallback
 */
export function getAircraftFactor(aircraftType) {
  // Normalisiere den Flugzeugtyp (Groß-/Kleinschreibung, Leerzeichen)
  const normalizedType = aircraftType.trim();

  // Prüfe, ob der Flugzeugtyp in den Faktoren vorhanden ist
  console.log(`🔍 Suche Flugzeugfaktor für "${aircraftType}"...  "${AIRCRAFT_FACTORS}`);
  
  // Direkte Übereinstimmung
  if (AIRCRAFT_FACTORS[normalizedType]) {
    return AIRCRAFT_FACTORS[normalizedType].factor2;
  }
  
  // Versuche case-insensitive Suche
  const typeUpper = normalizedType.toUpperCase();
  for (const [key, value] of Object.entries(AIRCRAFT_FACTORS)) {
    if (key.toUpperCase() === typeUpper) {
      return value.factor2;
    }
  }
  
  // Versuche partielle Übereinstimmung
  for (const [key, value] of Object.entries(AIRCRAFT_FACTORS)) {
    if (normalizedType.includes(key) || key.includes(normalizedType)) {
      console.log(`  ℹ️ Partielle Übereinstimmung: "${aircraftType}" → "${key}"`);
      return value.factor2;
    }
  }
  
  // Standard-Faktor für unbekannte Typen
  console.warn(`Flugzeugtyp "${aircraftType}" nicht in DMST-Index gefunden. Verwende Standardfaktor 1.0`);
  return 1.0;
}

/**
 * Hilfsfunktion: Fügt ein neues Flugzeug zur Laufzeit hinzu
 * @param {string} aircraftType - Der Flugzeugtyp
 * @param {number} dmstIndex - Der DMST-Index des Flugzeugs
 */
export function addAircraft(aircraftType, dmstIndex) {
  AIRCRAFT_DMST_INDEX[aircraftType] = dmstIndex;
  AIRCRAFT_FACTORS[aircraftType] = calculateAircraftFactors(dmstIndex);
  console.log(`Flugzeug "${aircraftType}" mit DMST-Index ${dmstIndex} hinzugefügt`);
}

/**
 * Debug-Funktion: Zeigt alle Flugzeugfaktoren in einer Tabelle
 */
export function debugAircraftFactors() {
  console.log('\n🛩️ FLUGZEUGFAKTOREN-TABELLE:');
  console.log('================================================');
  console.log('Flugzeug         | Index | Factor1  | Factor2');
  console.log('------------------------------------------------');
  
  Object.entries(AIRCRAFT_FACTORS)
    .sort((a, b) => b[1].index - a[1].index) // Nach Index sortieren (höchster zuerst)
    .forEach(([aircraft, factors]) => {
      const name = aircraft.padEnd(15);
      const index = factors.index.toString().padStart(5);
      const factor1 = factors.factor1.toFixed(6);
      const factor2 = factors.factor2.toFixed(5);
      console.log(`${name} | ${index} | ${factor1} | ${factor2}`);
    });
  
  console.log('================================================');
  console.log('Formel: factor2 = (100 / DMST_Index)²');
  console.log('Je höher der Index, desto niedriger der Faktor');
}

// Beispiel für die Verwendung in der Punkteberechnung:
export function calculateFlightPoints(distance, pilotFactor, aircraftType, airfieldFactor) {
  const aircraftFactor = getAircraftFactor(aircraftType);
  const points = distance * pilotFactor * aircraftFactor * airfieldFactor;
  
  return {
    points: points,
    factors: {
      distance: distance,
      pilotFactor: pilotFactor,
      aircraftFactor: aircraftFactor,
      airfieldFactor: airfieldFactor
    }
  };
}

// Export für Kompatibilität mit bestehendem Code
export default AIRCRAFT_FACTORS;

// Pilotenfaktor-Schwellenwerte
export const PILOT_FACTORS = [
  { maxKm: 50, factor: 4.0, percent: 400 },
  { maxKm: 100, factor: 3.0, percent: 300 },
  { maxKm: 300, factor: 2.0, percent: 200 },
  { maxKm: 500, factor: 1.6, percent: 160 },
  { maxKm: 700, factor: 1.4, percent: 140 },
  { maxKm: 1000, factor: 1.2, percent: 120 },
  { maxKm: Infinity, factor: 1.0, percent: 100 }
];

// Liste der Fluglehrer (Ausnahmen für Co-Piloten Regeln)
export const FLIGHT_INSTRUCTORS = [
  "Guido Halter",
  "Kurt Sauter",
  "Werner Rissi",
  "Heinz Bärfuss",
  "Roman Bühler",
  "Roman Andreas Buehler",
  "Roger Larpin",
  "Sg Saentis"
];

// Historische Pilotenfaktoren
export const HISTORICAL_PILOT_FACTORS = {
  "Guido Halter": 1.2,
  "Roman Andreas Buehler": 1.2,
  "Wolfgang Rapp": 1.2,
  "Martin Prusak": 1.4,
  "Rainer Ender": 1.4,
  "Werner Rissi": 1.4,
  "Fabian Schäfer": 1.4,
  "Heinz Bärfuss": 1.2,
  "Herbert Stoffel": 2.0,
  "DEFAULT": 4.0
};

// Startplatzfaktoren
export const AIRFIELD_FACTORS = {
  "St Gallen-Altenrhein": 1.0,  // Homebase
  "DEFAULT": 0.8                // Andere Startplätze
};

// Anwendungskonfiguration
export const APP_CONFIG = {
  BEST_FLIGHTS_COUNT: 3,    // Anzahl der besten Flüge für die Gesamtwertung
  DEFAULT_ACTIVE_TAB: 'flightdetails',  // Standardmäßig aktiver Tab
  CHART_LIMITS: {
    TOP_KM: 15,             // Anzahl der Top-KM-Flüge im Chart
    TOP_SPEED: 15,          // Anzahl der Top-Speed-Flüge im Chart 
    WEGLIDE_POINTS: 6       // Anzahl der besten Flüge für WeGlide-Punktewertung
  },
  PAGINATION: {
    FLIGHTS_PER_PAGE: 10,   // Anzahl der Flüge pro Seite
    LOAD_MORE_COUNT: 15     // Anzahl der zusätzlich zu ladenden Flüge bei "Mehr laden"
  }
};

// Farben für Charts und UI-Elemente
export const COLORS = {
  PRIMARY: '#4a7dff',
  PRIMARY_HOVER: '#3a6ae0',
  SUCCESS: '#4CAF50',
  ERROR: '#f44336',
  WARNING: '#FF9800',
  CHART: {
    KM: [
      'rgba(76, 175, 80, 0.6)',    // 1. Platz - Hellgrün
      'rgba(139, 195, 74, 0.6)',   // 2. Platz - Hellgrün-Gelb
      'rgba(205, 220, 57, 0.6)',   // 3. Platz - Hellgelb
      'rgba(120, 194, 173, 0.6)'   // Restliche - Helles Türkis
    ],
    SPEED: [
      'rgba(3, 155, 229, 0.5)',    // 1. Platz - Helles Blau
      'rgba(3, 244, 188, 0.5)',    // 2. Platz - Helleres Blau
      'rgba(41, 246, 127, 0.5)',   // 3. Platz - Noch helleres Blau
      'rgba(79, 195, 247, 0.5)'    // Restliche - Standardblau
    ],
    POINTS: 'rgba(52, 152, 219, 0.7)',
    FLIGHTS_COUNT: 'rgba(155, 89, 182, 0.7)',
    WEGLIDE_POINTS: 'rgba(46, 204, 167, 0.7)'
  }
};

// Formatierungsoptionen
export const FORMAT_OPTIONS = {
  DATE: {
    SHORT: { day: '2-digit', month: '2-digit', year: 'numeric' },
    WITH_TIME: { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    MONTH_YEAR: { month: 'long', year: 'numeric' }
  },
  NUMBER: {
    DEFAULT: { locale: 'de-CH' },
    DISTANCE: { locale: 'de-CH', minimumFractionDigits: 0, maximumFractionDigits: 1 },
    POINTS: { locale: 'de-CH', minimumFractionDigits: 2, maximumFractionDigits: 2 },
    FACTOR: { locale: 'de-CH', minimumFractionDigits: 3, maximumFractionDigits: 5 }
  }
};

// URL zu externen Ressourcen
export const EXTERNAL_URLS = {
  WEGLIDE_FLIGHT: 'https://www.weglide.org/flight/',
  WEGLIDE_PROFILE: 'https://www.weglide.org/pilot/',
  WEGLIDE_CLUB: 'https://www.weglide.org/club/5',
  IMAGES: {
    FLIGHT: 'https://weglidefiles.b-cdn.net/flight/',
    BADGE: 'https://weglidefiles.b-cdn.net/badge/'
  }
};

// Fallback-Daten für den Fall, dass die API nicht verfügbar ist
export const FALLBACK_DATA = [
  {
    name: "Guido Halter",
    userId: 10518,
    totalPoints: 1048.9,
    flights: [
      { date: "29.03.2025", km: 436, points: 322.1, pFactor: 1.2, flzFaktor: 0.76947, startplatz: 0.8, flugzeugTyp: "Discus 2T" },
      { date: "31.03.2025", km: 445, points: 328.7, pFactor: 1.2, flzFaktor: 0.76947, startplatz: 0.8, flugzeugTyp: "Discus 2T" },
      { date: "09.04.2025", km: 539, points: 398.2, pFactor: 1.2, flzFaktor: 0.76947, startplatz: 0.8, flugzeugTyp: "Discus 2T" }
    ]
  },
  {
    name: "Stefan Gertsch",
    userId: 10519,
    totalPoints: 1003.0,
    flights: [
      { date: "20.04.2025", km: 232, points: 274.6, pFactor: 1.6, flzFaktor: 0.92456, startplatz: 0.8, flugzeugTyp: "DG-300" },
      { date: "09.04.2025", km: 342, points: 505.9, pFactor: 2, flzFaktor: 0.92456, startplatz: 0.8, flugzeugTyp: "DG-300" },
      { date: "19.04.2025", km: 188, points: 222.5, pFactor: 1.6, flzFaktor: 0.92456, startplatz: 0.8, flugzeugTyp: "DG-300" }
    ]
  }
];

// Punkteberechnungs-Formel (als String für Dokumentationszwecke)
export const POINTS_FORMULA = {
  DESCRIPTION: "Punkte = Distanz × P-Faktor × Flz-Faktor × Startplatzfaktor",
  TOOLTIP: `
    <p><strong>Punkteformel:</strong> Punkte = Distanz × P-Faktor × Flz-Faktor × Startplatzfaktor</p>
    <p>Die Gesamtpunkte für die Rangliste sind die Summe der drei besten Flüge.</p>
  `
};

// DOM-Selektoren für UI-Elemente
export const DOM_SELECTORS = {
  STATS: {
    TOTAL_PILOTS: '#total-pilots',
    TOTAL_FLIGHTS: '#total-flights',
    TOTAL_KM: '#total-km',
    LONGEST_FLIGHT: '#longest-flight',
    MAX_POINTS: '#max-points'
  },
  STATUS: {
    DATA_SOURCE: '#data-source',
    LOADING: '#loading-message',
    ERROR: '#api-error-message',
    SUCCESS: '#update-success'
  },
  TABLES: {
    RANKING_BODY: '#ranking-body'
  },
  CONTAINERS: {
    LATEST_FLIGHTS: '#latest-flights-container',
    ACHIEVEMENTS: '#user-achievements-container'
  },
  CHARTS: {
    POINTS: '#points-chart',
    FLIGHTS: '#flights-per-pilot-chart',
    KM: '#km-chart',
    SPEED: '#top-speed-chart',
    WEGLIDE: '#weglide-points-chart'
  },
  BUTTONS: {
    REFRESH: '#refresh-button'
  },
  INPUTS: {
    NAME_FILTER: '#name-filter'
  }
};

/**
 * Berechnet Flugzeugfaktoren aus DMST-Index
 * Formel: factor2 = (100 / dmst_index)²
 */
export function calculateAircraftFactorFromIndex(dmstIndex) {
  return Math.pow(100 / dmstIndex, 2);
}

// Validierung der bestehenden Faktoren (optional)
export function validateAircraftFactors() {
  console.log('Validiere Flugzeugfaktoren...');
  let allCorrect = true;
  
  Object.entries(AIRCRAFT_FACTORS).forEach(([aircraft, data]) => {
    const calculated = calculateAircraftFactorFromIndex(data.index);
    const stored = data.factor2;
    const diff = Math.abs(calculated - stored);
    
    if (diff > 0.00001) {
      console.warn(`❌ ${aircraft}: Gespeichert=${stored}, Berechnet=${calculated}, Diff=${diff}`);
      allCorrect = false;
    }
  });
  
  if (allCorrect) {
    console.log('✅ Alle Flugzeugfaktoren sind korrekt!');
  }
}
debugAircraftFactors();
validateAircraftFactors();
