/**
 * SG Säntis Cup - Hilfsfunktionen
 * 
 * Diese Datei enthält Hilfsfunktionen, die in mehreren Modulen 
 * der Anwendung genutzt werden.
 */

/**
 * Formatiert eine Zahl mit Tausendertrennzeichen
 * @param {number|string} num - Die zu formatierende Zahl
 * @returns {string} - Formatierte Zahl
 */
export function formatNumber(num) {
  if (typeof num === 'string') {
    num = parseFloat(num);
  }
  
  if (isNaN(num)) return '0';
  
  return num.toLocaleString('de-CH');
}

/**
 * Formatiert das Datum für die Anzeige (mit Uhrzeit)
 * @param {string} dateTimeString - Datum-Zeit-String
 * @returns {string} - Formatiertes Datum mit Uhrzeit
 */
export function formatDateForDisplay(dateTimeString) {
  if (!dateTimeString) return '';

  const date = new Date(dateTimeString);
  if (isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

/**
 * Formatiert das Datum im ISO-Format mit Uhrzeit
 * @param {string} isoString - ISO Datum-String
 * @returns {string} - Formatiertes Datum mit Uhrzeit
 */
export function formatISODateTime(isoString) {
  if (!isoString) return '';

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Formatiert das Datum ohne Uhrzeit
 * @param {string} dateString - Datum-String
 * @returns {string} - Formatiertes Datum
 */
export function formatDateWithoutTime(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
}

/**
 * Zeigt eine Benachrichtigung an
 * @param {string} elementId - ID des Benachrichtigungselements
 * @param {string} message - Optional: Benutzerdefinierte Nachricht
 * @param {number} duration - Optional: Anzeigedauer in ms (Standard: 3000)
 * @param {boolean} isError - Optional: Ob es sich um einen Fehler handelt
 */
export function showNotification(elementId, message = null, duration = 3000, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) {
    // Erstelle eine Benachrichtigung, wenn kein Element existiert
    const notification = document.createElement('div');
    notification.id = elementId;
    notification.className = isError ? 'notification error' : 'notification';
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '10px 20px';
    notification.style.backgroundColor = isError ? '#f44336' : '#4CAF50';
    notification.style.color = 'white';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    notification.style.zIndex = '1000';
    notification.style.display = 'none';

    if (message) {
      notification.textContent = message;
    } else {
      notification.textContent = isError ?
        'Ein Fehler ist aufgetreten' :
        'Operation erfolgreich';
    }

    document.body.appendChild(notification);

    notification.style.display = 'block';
    setTimeout(() => {
      notification.style.display = 'none';
    }, duration);
  } else {
    // Verwende das bestehende Element
    if (message) {
      element.textContent = message;
    }

    element.style.display = 'block';
    setTimeout(() => {
      element.style.display = 'none';
    }, duration);
  }
}

/**
 * Sortiert ein Array von Objekten nach einem bestimmten Schlüssel
 * @param {Array} array - Zu sortierendes Array
 * @param {string|Function} key - Schlüssel oder Vergleichsfunktion
 * @param {boolean} ascending - Aufsteigend sortieren (true) oder absteigend (false)
 * @returns {Array} - Sortiertes Array
 */
export function sortArrayByKey(array, key, ascending = true) {
  if (!Array.isArray(array)) return [];
  
  return [...array].sort((a, b) => {
    let valA, valB;
    
    if (typeof key === 'function') {
      valA = key(a);
      valB = key(b);
    } else {
      valA = a[key];
      valB = b[key];
    }
    
    // Vergleiche Werte basierend auf ihrem Typ
    if (typeof valA === 'string' && typeof valB === 'string') {
      return ascending ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return ascending ? valA - valB : valB - valA;
    }
  });
}

/**
 * Filtert ein Array von Objekten basierend auf einem Suchbegriff und Suchfeldern
 * @param {Array} array - Zu filterndes Array
 * @param {string} searchTerm - Suchbegriff
 * @param {Array} fields - Felder, in denen gesucht werden soll
 * @returns {Array} - Gefiltertes Array
 */
export function filterArrayBySearchTerm(array, searchTerm, fields) {
  if (!Array.isArray(array) || !searchTerm || !Array.isArray(fields) || fields.length === 0) {
    return array;
  }
  
  const term = searchTerm.toLowerCase().trim();
  
  return array.filter(item => {
    return fields.some(field => {
      const value = item[field];
      
      if (typeof value === 'string') {
        return value.toLowerCase().includes(term);
      } else if (typeof value === 'number') {
        return value.toString().includes(term);
      }
      
      return false;
    });
  });
}

/**
 * Gruppiert ein Array von Objekten nach einem bestimmten Schlüssel
 * @param {Array} array - Zu gruppierendes Array
 * @param {string|Function} key - Schlüssel oder Funktion zur Bestimmung des Gruppenschlüssels
 * @returns {Object} - Gruppiertes Objekt
 */
export function groupArrayByKey(array, key) {
  if (!Array.isArray(array)) return {};
  
  return array.reduce((result, item) => {
    const groupKey = typeof key === 'function' ? key(item) : item[key];
    
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    
    result[groupKey].push(item);
    return result;
  }, {});
}

/**
 * Erstellt eine eindeutige ID
 * @returns {string} - Eindeutige ID
 */
export function generateUniqueId() {
  return '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Prüft, ob ein Objekt leer ist
 * @param {Object} obj - Zu prüfendes Objekt
 * @returns {boolean} - true, wenn das Objekt leer ist, sonst false
 */
export function isEmptyObject(obj) {
  return Object.keys(obj).length === 0 && obj.constructor === Object;
}

/**
 * Tiefe Kopie eines Objekts erstellen
 * @param {Object} obj - Zu kopierendes Objekt
 * @returns {Object} - Kopie des Objekts
 */
export function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Fügt ein InfoIcon mit Tooltip-Erklärung zu einem Element hinzu
 * @param {string} elementId - ID des Elements, an das das InfoIcon angefügt werden soll
 * @param {string} tooltipText - Text, der im Tooltip angezeigt werden soll
 */
export function addInfoIconWithTooltip(elementId, tooltipText) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  // InfoIcon erstellen
  const infoIcon = document.createElement('span');
  infoIcon.className = 'info-icon';
  infoIcon.innerHTML = '&#9432;'; // Info-Symbol
  infoIcon.style.marginLeft = '5px';
  infoIcon.style.cursor = 'pointer';
  infoIcon.style.color = '#4a7dff';
  
  // Tooltip erstellen
  const tooltip = document.createElement('span');
  tooltip.className = 'tooltip';
  tooltip.textContent = tooltipText;
  tooltip.style.visibility = 'hidden';
  tooltip.style.position = 'absolute';
  tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  tooltip.style.color = '#fff';
  tooltip.style.padding = '5px 10px';
  tooltip.style.borderRadius = '4px';
  tooltip.style.zIndex = '1000';
  tooltip.style.width = '250px';
  tooltip.style.fontSize = '14px';
  
  // Events für Tooltip
  infoIcon.addEventListener('mouseenter', function(e) {
    tooltip.style.visibility = 'visible';
    tooltip.style.left = (e.pageX + 10) + 'px';
    tooltip.style.top = (e.pageY + 10) + 'px';
  });
  
  infoIcon.addEventListener('mouseleave', function() {
    tooltip.style.visibility = 'hidden';
  });
  
  // Zum DOM hinzufügen
  infoIcon.appendChild(tooltip);
  element.appendChild(infoIcon);
}

/**
 * Berechnet den Durchschnitt eines Arrays von Zahlen
 * @param {Array} array - Array mit Zahlen
 * @returns {number} - Durchschnitt
 */
export function calculateAverage(array) {
  if (!Array.isArray(array) || array.length === 0) return 0;
  
  const sum = array.reduce((acc, val) => acc + (Number(val) || 0), 0);
  return sum / array.length;
}

/**
 * Berechnet die Summe eines Arrays von Zahlen
 * @param {Array} array - Array mit Zahlen
 * @returns {number} - Summe
 */
export function calculateSum(array) {
  if (!Array.isArray(array) || array.length === 0) return 0;
  
  return array.reduce((acc, val) => acc + (Number(val) || 0), 0);
}