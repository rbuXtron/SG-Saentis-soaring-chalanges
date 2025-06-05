/**
 * SG Säntis Cup - Hauptanwendung mit SVG-Icons und Floating Tags
 * Version 3.4 - Mit korrigierten Saison-Statistiken und Badge-Integration
 * 
 * Diese Version nutzt professionelle SVG-Icons für bessere UX
 * und schatten-betonte Stat-Cards mit Floating Pilot Tags
 */

import { formatNumber, formatDateForDisplay, showNotification } from '../utils/utils.js';
import { apiClient } from '../services/weglide-api-service.js';
import { fetchAllWeGlideData } from '../core/data-processor.js';
import { renderRankingTable, renderLatestClubFlights } from '../components/ranking-component.js';
import { renderAllCharts } from '../components/chart-generators.js';
import { renderBadgeRanking } from '../components/badges-component.js';
import { loadPilotBadgesWithYearVerification } from '../services/badge-loader-service.js';
import { dataLoadingManager } from '../services/data-loading-manager.js';

/**
 * SVG-Icons Collection für das Projekt
 */
const SVG_ICONS = {
  // Info/Hilfe Icon
  info: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
</svg>`,

  // Flugzeug Icon
  airplane: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
  </svg>`,

  // Trophy/Pokal Icon
  trophy: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>`,

  // Statistik/Chart Icon
  chart: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
  </svg>`,

  // Badge/Award Icon
  badge: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  </svg>`,

  // Pilot/Person Icon
  pilot: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zM4 18v-4h2v4h1l5-5 5 5h1v-4h2v6H4z"/>
  </svg>`,

  // Refresh/Update Icon
  refresh: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
  </svg>`,

  // Distance/Route Icon
  route: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 15l-6 6-1.42-1.42L15.17 16H4V4h2v10h9.17l-3.59-3.58L13 9l6 6z"/>
  </svg>`,

  // Speed/Lightning Icon
  speed: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
  </svg>`
};

/**
 * SVG-Icons für Tabellen-Header
 */
const TABLE_HEADER_SVG_ICONS = {
  // Rang/Medal Icon
  rank: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>`,

  // Pilot/Person Icon
  pilot: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
  </svg>`,

  // Distanz/Route Icon
  distance: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 0l-4 4 4 4 4-4-4-4zm8 0l-4 4 4 4V8z"/>
  </svg>`,

  // Flugzeug/Flights Icon
  flights: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
  </svg>`,

  // Punkte/Target Icon
  points: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`,

  // Details/Info Icon
  details: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
  </svg>`
};

/**
 * Hauptklasse für die SG Säntis Cup Anwendung mit SVG-Icons und Floating Tags
 */
class SGSaentisCupApp {
  constructor() {
    this.pilotData = null;
    this.stats = null;
    this.isLoading = false;
    this.activeTab = 'flightdetails';
    this.error = null;
    this.dataSource = 'Lokale Daten';
    this.searchTerm = '';
    this.tooltipInitialized = false;
    this.overlay = null;
    this.badgesLoaded = false; // Track ob Badges bereits geladen wurden
  }

  /**
   * Initialisiert die Anwendung mit SVG-Icons
   */
  async init() {
    try {
      console.log('SG Säntis Cup App wird initialisiert (Version 3.4)...');

      // Mache wichtige Funktionen global für Debugging
      window.sgApp = this;
      window.apiClient = apiClient; // Import apiClient oben hinzufügen
      window.refreshData = () => this.refreshData();

      // Event-Handler und UI initialisieren
      this.setupEventHandlers();
      this.createTooltipOverlay();
      this.setupTabHandling();
      this.setupSearchHandling();
      this.enhanceUIWithSVGIcons();

      // Daten laden
      await this.loadInitialData();

      // Zeige Loading-Statistiken
        dataLoadingManager.printStats();

      // Tooltips nach vollständiger UI-Initialisierung
      setTimeout(() => {
        this.initializeTooltips();
      }, 500);

      console.log('SG Säntis Cup App erfolgreich initialisiert (Version 3.4)');
    } catch (e) {
      console.error('Fehler beim Initialisieren der App:', e);
    }
  }

  /**
   * Verbessert die UI mit SVG-Icons
   */
  enhanceUIWithSVGIcons() {
    console.log('Verbessere UI mit SVG-Icons...');

    try {
      // 1. Tab-Icons hinzufügen
      this.addTabIcons();

      // 2. Refresh-Button Icon hinzufügen
      this.enhanceRefreshButton();

      // 3. Statistik-Karten Icons hinzufügen
      setTimeout(() => {
        this.addStatCardIcons();
      }, 1000);

      // 4. Tabellen-Header Icons hinzufügen
      setTimeout(() => {
        this.addSVGIconsToTableHeaders();
      }, 1200);

    } catch (error) {
      console.error('Fehler beim Hinzufügen der SVG-Icons:', error);
    }
  }

  /**
   * Fügt Icons zu den Tabs hinzu
   */
  addTabIcons() {
    const tabIconMap = {
      'flightdetails': 'airplane',
      'rangliste': 'trophy',
      'badges': 'badge',
      'statistics': 'chart'
    };

    try {
      document.querySelectorAll('.tab').forEach(tab => {
        const tabId = tab.getAttribute('data-tab');
        const iconName = tabIconMap[tabId];

        if (iconName && SVG_ICONS[iconName]) {
          // Prüfe ob bereits ein Icon vorhanden ist
          if (tab.querySelector('.tab-icon-svg')) return;

          const iconContainer = document.createElement('div');
          iconContainer.className = 'tab-icon-svg';
          iconContainer.innerHTML = SVG_ICONS[iconName];

          // Icon am Anfang des Tabs einfügen
          tab.insertBefore(iconContainer, tab.firstChild);

          console.log(`Icon "${iconName}" zu Tab "${tabId}" hinzugefügt`);
        }
      });
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Tab-Icons:', error);
    }
  }

  /**
   * Verbessert den Refresh-Button mit Icon
   */
  enhanceRefreshButton() {
    try {
      const refreshButton = document.getElementById('refresh-button');
      if (!refreshButton) return;

      // Prüfe ob bereits ein Icon vorhanden ist
      if (refreshButton.querySelector('.refresh-icon-svg')) return;

      const iconContainer = document.createElement('span');
      iconContainer.className = 'refresh-icon-svg';
      iconContainer.innerHTML = SVG_ICONS.refresh;

      // Text des Buttons anpassen
      const buttonText = refreshButton.textContent;
      refreshButton.innerHTML = '';
      refreshButton.appendChild(iconContainer);

      const textSpan = document.createElement('span');
      textSpan.textContent = buttonText;
      refreshButton.appendChild(textSpan);

      console.log('Refresh-Button mit SVG-Icon verbessert');
    } catch (error) {
      console.error('Fehler beim Verbessern des Refresh-Buttons:', error);
    }
  }

  /**
   * Fügt Icons zu Statistik-Karten hinzu
   */
  addStatCardIcons() {
    const statIconMap = {
      'total-pilots': 'pilot',
      'total-flights': 'airplane',
      'total-km': 'route',
      'longest-flight': 'route',
      'max-points': 'speed'
    };

    try {
      return; // Deaktiviert für Floating Tag Design
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Statistik-Icons:', error);
    }
  }

  /**
   * Fügt SVG-Icons zu Tabellen-Headern hinzu
   */
  addSVGIconsToTableHeaders() {
    console.log('Füge SVG-Icons zu Tabellen-Headern hinzu...');

    try {
      // Mapping der Header-Texte zu Icons
      const headerIconMapping = {
        'Rang': 'rank',
        'Pilot': 'pilot',
        'Gesamt Kilometer': 'distance',
        'Kilometer': 'distance',
        'gewertete Flüge': 'flights',
        'Flüge': 'flights',
        'Gesamt Punkte': 'points',
        'Punkte': 'points',
        'Details': 'details'
      };

      // Finde alle Tabellen-Header
      const tableHeaders = document.querySelectorAll('.ranking-table th');

      tableHeaders.forEach(header => {
        // Überspringe bereits bearbeitete Header
        if (header.querySelector('.table-header-icon')) {
          return;
        }

        const headerText = header.textContent.trim();
        let iconKey = null;

        // Finde passendes Icon basierend auf Header-Text
        for (const [text, icon] of Object.entries(headerIconMapping)) {
          if (headerText.includes(text)) {
            iconKey = icon;
            break;
          }
        }

        if (iconKey && TABLE_HEADER_SVG_ICONS[iconKey]) {
          // Erstelle Icon-Container
          const iconContainer = document.createElement('span');
          iconContainer.className = `table-header-icon table-header-svg-icon`;
          iconContainer.innerHTML = TABLE_HEADER_SVG_ICONS[iconKey];

          // Füge Icon am Anfang des Headers ein
          header.insertBefore(iconContainer, header.firstChild);

          console.log(`✅ Icon "${iconKey}" zu Header "${headerText}" hinzugefügt`);
        }
      });

    } catch (error) {
      console.error('Fehler beim Hinzufügen der Header-Icons:', error);
    }
  }

  /**
   * Erstellt das Tooltip-Overlay für zentrierte Anzeige
   */
  createTooltipOverlay() {
    if (this.overlay) return;

    this.overlay = document.createElement('div');
    this.overlay.className = 'tooltip-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 9999;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
    `;

    document.body.appendChild(this.overlay);

    // Overlay-Klick schließt alle Tooltips
    this.overlay.addEventListener('click', () => {
      this.closeAllTooltips();
    });

    console.log('Tooltip-Overlay erstellt');
  }

  /**
   * VERBESSERTES TOOLTIP-SYSTEM mit SVG-Icon
   */
  initializeTooltips() {
    if (this.tooltipInitialized) return;

    console.log('Initialisiere verbessertes Tooltip-System mit SVG-Icons...');

    const initTooltips = () => {
      const infoIcons = document.querySelectorAll('.info-icon, .info-icon-svg');
      console.log(`Gefundene Info-Icons: ${infoIcons.length}`);

      if (infoIcons.length === 0) {
        setTimeout(initTooltips, 500);
        return;
      }

      infoIcons.forEach((icon, index) => {
        // Verhindere doppelte Event-Handler
        if (icon.hasAttribute('data-tooltip-initialized')) return;
        icon.setAttribute('data-tooltip-initialized', 'true');

        console.log(`Initialisiere Tooltip ${index + 1}`);

        // Touch & Click Support
        icon.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();

          const container = icon.closest('.tooltip-container');
          if (!container) return;

          const isActive = container.classList.contains('active');

          // Alle anderen Tooltips schließen
          document.querySelectorAll('.tooltip-container.active').forEach(activeContainer => {
            if (activeContainer !== container) {
              activeContainer.classList.remove('active');
            }
          });

          // Aktuellen Tooltip umschalten
          if (!isActive) {
            this.showTooltip(container);
          } else {
            this.closeAllTooltips();
          }
        });

        // Keyboard Support
        icon.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            icon.click();
          } else if (e.key === 'Escape') {
            this.closeAllTooltips();
          }
        });
      });

      this.tooltipInitialized = true;
      console.log('Tooltip-System erfolgreich initialisiert');
    };

    // Globale Event-Listener
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.tooltip-container') && !e.target.closest('.tooltip-content')) {
        this.closeAllTooltips();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllTooltips();
      }
    });

    initTooltips();
  }

  /**
   * Zeigt ein Tooltip an
   */
  showTooltip(container) {
    container.classList.add('active');

    if (this.overlay) {
      this.overlay.style.opacity = '1';
      this.overlay.style.visibility = 'visible';
      document.body.style.overflow = 'hidden';
    }
  }

  /**
   * Schließt alle Tooltips
   */
  closeAllTooltips() {
    document.querySelectorAll('.tooltip-container.active').forEach(container => {
      container.classList.remove('active');
    });

    if (this.overlay) {
      this.overlay.style.opacity = '0';
      this.overlay.style.visibility = 'hidden';
      document.body.style.overflow = '';
    }
  }

  /**
   * Fügt Info-Icon mit Tooltip zur SG Säntis Cup Überschrift hinzu
   * VERBESSERT: Mit professionellem SVG-Icon
   */
  addInfoIconToTitle() {
    // Prüfe ob bereits vorhanden
    if (document.querySelector('.ranking-header .info-icon, .ranking-header .info-icon-svg')) {
      return;
    }

    // Finde den Ranking-Titel
    const titleElements = [
      document.querySelector('.ranking-header h2'),
      document.querySelector('.ranking-header .section-title'),
      ...document.querySelectorAll('h1, h2, h3, h4, h5, h6')
    ].filter(Boolean);

    const targetTitle = titleElements.find(el =>
      el && el.textContent && (
        el.textContent.includes('SG Säntis Cup') ||
        el.textContent.includes('Säntis Cup') ||
        el.textContent.includes('Rangliste')
      )
    );

    if (!targetTitle) {
      console.warn('Ranking-Titel nicht gefunden für Info-Icon.');
      return;
    }

    console.log('Füge SVG Info-Icon zum Titel hinzu:', targetTitle.textContent);
    this.addInfoIconToElement(targetTitle);
  }

  /**
   * Hilfsfunktion: Fügt SVG Info-Icon zu einem spezifischen Element hinzu
   */
  addInfoIconToElement(targetElement) {
    if (!targetElement) return;

    try {
      // Container für Titel + Icon erstellen
      const titleContainer = document.createElement('div');
      titleContainer.style.display = 'flex';
      titleContainer.style.alignItems = 'center';
      titleContainer.style.justifyContent = 'center';
      titleContainer.style.gap = '12px';
      titleContainer.style.flexWrap = 'wrap';

      // Originalen Text extrahieren
      const originalText = targetElement.textContent.trim();

      // Titel-Span erstellen
      const textSpan = document.createElement('span');
      textSpan.textContent = originalText;

      // Tooltip-Container erstellen
      const tooltipContainer = document.createElement('div');
      tooltipContainer.className = 'tooltip-container';

      // SVG Info-Icon erstellen (statt "?")
      const infoIcon = document.createElement('div');
      infoIcon.className = 'info-icon info-icon-svg';
      infoIcon.innerHTML = SVG_ICONS.info; // SVG statt Text
      infoIcon.setAttribute('tabindex', '0');
      infoIcon.setAttribute('role', 'button');
      infoIcon.setAttribute('aria-label', 'Vollständige Informationen zur Punkteberechnung');

      // Tooltip-Inhalt erstellen
      const tooltipContent = document.createElement('div');
      tooltipContent.className = 'tooltip-content';
      tooltipContent.setAttribute('role', 'tooltip');
      tooltipContent.setAttribute('aria-hidden', 'true');

      tooltipContent.innerHTML = `
        <h4 class="tooltip-title">SG Säntis Cup - Punktesystem</h4>
        
        <div class="section-title">Grundformel</div>
        <p class="tooltip-text"><strong>Punkte = Distanz × P-Faktor × Flz-Faktor × Startplatzfaktor</strong></p>
        <p class="tooltip-text">Die drei besten Flüge werden für die Gesamtwertung herangezogen.</p>
        
        <div class="section-title">Pilotenfaktor (P-Faktor)</div>
        <p class="tooltip-text">Basiert auf der größten bisher geflogenen Distanz:</p>
        <table class="faktor-table">
          <thead>
            <tr>
              <th>Distanz</th>
              <th>Faktor</th>
              <th>Prozent</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>bis 50 km</td><td>4.0</td><td>400%</td></tr>
            <tr><td>bis 100 km</td><td>3.0</td><td>300%</td></tr>
            <tr><td>bis 300 km</td><td>2.0</td><td>200%</td></tr>
            <tr><td>bis 500 km</td><td>1.6</td><td>160%</td></tr>
            <tr><td>bis 700 km</td><td>1.4</td><td>140%</td></tr>
            <tr><td>bis 1000 km</td><td>1.2</td><td>120%</td></tr>
            <tr><td>über 1000 km</td><td>1.0</td><td>100%</td></tr>
          </tbody>
        </table>
        
        <div class="section-title">Flugzeugfaktor (Flz-Faktor)</div>
        <p class="tooltip-text">Berücksichtigt die unterschiedlichen Leistungen verschiedener Flugzeugtypen.</p>
        <p class="tooltip-text"><strong>Beispiele:</strong> Discus 2T = 0.769, DG-300 = 0.925, JS1-21 = 0.630</p>
        <p class="tooltip-text">Je leistungsfähiger das Flugzeug, desto niedriger der Faktor.</p>
        
        <div class="section-title">Startplatzfaktor (Heimatflugplatz)</div>
        <p class="tooltip-text">Berücksichtigt den Homebase-Vorteil:</p>
        <ul class="tooltip-list">
          <li><strong>St. Gallen-Altenrhein:</strong> Faktor 1.0 (100%)</li>
          <li><strong>Andere Startplätze:</strong> Faktor 0.8 (80%)</li>
        </ul>
        <p class="tooltip-text">Der Heimatflugplatz bietet Vorteile durch lokale Kenntnisse und gewohnte Bedingungen.</p>
        
        <div class="tooltip-highlight">
          <strong>Fairness-System:</strong> Der Pilotenfaktor sorgt für Chancengleichheit zwischen erfahrenen und neuen Piloten. Historische Bestleistungen werden berücksichtigt.
        </div>
      `;

      // Zusammenbauen
      tooltipContainer.appendChild(infoIcon);
      tooltipContainer.appendChild(tooltipContent);

      titleContainer.appendChild(textSpan);
      titleContainer.appendChild(tooltipContainer);

      // Originalen Titel ersetzen
      targetElement.innerHTML = '';
      targetElement.appendChild(titleContainer);

      // Tooltip-System für neue Icons initialisieren
      setTimeout(() => {
        this.initializeTooltips();
      }, 100);
    } catch (error) {
      console.error('Fehler beim Hinzufügen des Info-Icons:', error);
    }
  }

  /**
   * Richtet die Event-Handler für die Benutzeroberfläche ein
   */
  setupEventHandlers() {
    // Refresh-Button
    const refreshButton = document.getElementById('refresh-button');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this.refreshData());
    }
  }

  /**
   * Richtet die Tab-Funktionalität ein
   */
  setupTabHandling() {
    const tabs = document.querySelectorAll('.tab');
    if (!tabs.length) return;

    tabs.forEach(tab => {
      tab.addEventListener('click', async (e) => {
        // Verhindere Interferenz mit Tooltips
        if (e.target.closest('.tooltip-container')) {
          e.stopPropagation();
          return;
        }

        const tabId = tab.getAttribute('data-tab');
        if (!tabId) return;

        console.log(`🔄 Tab-Wechsel zu: ${tabId}`);

        // Aktiven Tab wechseln
        document.querySelectorAll('.tab').forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        const tabContent = document.getElementById(tabId);
        if (tabContent) tabContent.classList.add('active');

        this.activeTab = tabId;

        // Nach Tab-Wechsel UI aktualisieren
        this.updateUI();

        // Nach Tab-Wechsel Infos zur Berechnung aktualisieren
        setTimeout(() => this.addInfoIconToTitle(), 300);
      });
    });
  }

  /**
   * Richtet die Suchfunktionalität ein
   */
  setupSearchHandling() {
    const nameFilter = document.getElementById('name-filter');
    if (!nameFilter) return;

    nameFilter.addEventListener('input', event => {
      this.searchTerm = event.target.value.toLowerCase().trim();
      this.updateUI();
    });
  }

  /**
   * Lädt die initialen Daten
   */
  async loadInitialData() {
    this.showLoading(true);

    try {
      const data = await fetchAllWeGlideData();
      console.log('Daten geladen:', data);

      // Prüfen ob Daten vorhanden sind - KORRIGIERT: data ist ein Objekt mit pilots Array
      if (!data || !data.pilots || !Array.isArray(data.pilots)) {
        console.warn('Keine gültigen Daten erhalten, verwende leeres Array');
        this.pilotData = [];
        this.stats = this.calculateAllFlightsStats([]);
        this.dataSource = 'Keine Daten verfügbar';

        // UI trotzdem aktualisieren
        this.updateUI();

        // Warnung anzeigen
        this.showErrorMessage('Keine Daten von der API erhalten. Bitte später erneut versuchen.');
        return;
      }
      
      // Daten aus dem data Objekt extrahieren
      const pilots = data.pilots;
      //const stats = data.stats;
      const sprintStats = data.sprintStats;

      // Badge-Daten für alle Piloten laden (nur wenn noch nicht vorhanden)
      //const pilotsWithoutBadges = data.filter(pilot => pilot.badgeCount === undefined);
      const pilotsWithoutBadges = pilots.filter(pilot => pilot.badgeCount === undefined);
      if (pilotsWithoutBadges.length > 0) {
        console.log('🏅 Lade Badge-Daten für Piloten...');

        // Badge-Daten parallel laden
        const batchSize = 3;
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize);

          await Promise.all(
            batch.map(async (pilot) => {
              if (pilot.badgeCount === undefined) {
                try {
                  const badgeData = await loadPilotBadgesWithYearVerification(pilot.userId, 2025);

                  // Badge-Daten zum Pilot hinzufügen
                  pilot.badges = badgeData.currentYearBadges;
                  pilot.allTimeBadges = badgeData.allTimeBadges;
                  pilot.badgeCount = badgeData.badgeCount;
                  pilot.allTimeBadgeCount = badgeData.allTimeBadgeCount;
                  pilot.verifiedBadgeCount = badgeData.verifiedCount;
                  pilot.badgeCategoryCount = badgeData.categoryCount;

                  console.log(`  ✅ Badges für ${pilot.name} geladen: ${pilot.badgeCount} Badges`);
                } catch (error) {
                  console.error(`  ❌ Fehler beim Laden der Badges für ${pilot.name}:`, error);
                  // Setze leere Badge-Daten bei Fehler
                  pilot.badges = [];
                  pilot.badgeCount = 0;
                  pilot.verifiedBadgeCount = 0;
                  pilot.badgeCategoryCount = 0;
                }
              }
            })
          );

          // Kleine Pause zwischen Batches
          if (i + batchSize < data.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }

      // Statistiken berechnen (NUR aktuelle Saison)
      this.stats = stats || this.calculateAllFlightsStats(pilots);

      this.pilotData = data;
      this.stats = stats;
      this.dataSource = data && data.length > 0 ? 'WeGlide API' : 'Lokale Daten';
      this.badgesLoaded = true;

      console.log('Datasource:', this.dataSource);

      // UI aktualisieren
      this.updateUI();

      // Global verfügbar machen für andere Komponenten
      window.pilotData = data;

    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
      this.error = 'Fehler beim Laden der Daten. Verwende lokale Daten.';

      // Fallback auf leere Daten
      this.pilotData = [];
      this.stats = this.calculateAllFlightsStats([]);
      this.dataSource = 'Lokale Daten';

      // UI aktualisieren mit Fallback-Daten
      this.updateUI();

      // Fehler anzeigen
      this.showErrorMessage(this.error);
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Aktualisiert die Daten
   */
  async refreshData() {
    const refreshButton = document.getElementById('refresh-button');
    if (refreshButton) {
      refreshButton.disabled = true;

      // Button-Text während des Ladens ändern
      const textSpan = refreshButton.querySelector('span:not(.refresh-icon-svg)');
      if (textSpan) {
        textSpan.textContent = 'Aktualisiere...';
      } else {
        refreshButton.textContent = 'Aktualisiere...';
      }
    }

    this.showLoading(true);

    try {
      // Cache leeren
      apiClient.clearCache();
      dataLoadingManager.clearCache();

      // Neue Daten laden
      const newData = await fetchAllWeGlideData();

      if (newData && newData.length > 0) {
        // Badge-Daten neu laden
        console.log('🏅 Aktualisiere Badge-Daten...');

        const batchSize = 3;
        for (let i = 0; i < newData.length; i += batchSize) {
          const batch = newData.slice(i, i + batchSize);

          await Promise.all(
            batch.map(async (pilot) => {
              try {
                const badgeData = await loadPilotBadgesWithYearVerification(pilot.userId, 2025);

                // Badge-Daten zum Pilot hinzufügen
                pilot.badges = badgeData.currentYearBadges;
                pilot.allTimeBadges = badgeData.allTimeBadges;
                pilot.badgeCount = badgeData.badgeCount;
                pilot.allTimeBadgeCount = badgeData.allTimeBadgeCount;
                pilot.verifiedBadgeCount = badgeData.verifiedCount;
                pilot.badgeCategoryCount = badgeData.categoryCount;
              } catch (error) {
                console.error(`Fehler beim Laden der Badges für ${pilot.name}:`, error);
                pilot.badges = [];
                pilot.badgeCount = 0;
              }
            })
          );

          if (i + batchSize < newData.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        this.pilotData = newData;
        this.stats = this.calculateAllFlightsStats(newData);
        this.dataSource = 'WeGlide API (aktualisiert)';
        this.badgesLoaded = true;

        // UI aktualisieren
        this.updateUI();

        // Erfolgs-Nachricht anzeigen
        showNotification('update-success', 'Daten erfolgreich aktualisiert', 3000);

        // Global verfügbar machen für andere Komponenten
        window.pilotData = newData;
      } else {
        throw new Error('Keine Daten erhalten');
      }
    } catch (error) {
      console.error('Fehler bei der Aktualisierung:', error);
      showNotification('api-error-message', `Fehler bei der Aktualisierung: ${error.message}`, 5000, true);
    } finally {
      if (refreshButton) {
        refreshButton.disabled = false;

        // Button-Text zurücksetzen
        const textSpan = refreshButton.querySelector('span:not(.refresh-icon-svg)');
        if (textSpan) {
          textSpan.textContent = 'Daten aktualisieren';
        } else {
          refreshButton.textContent = 'Daten aktualisieren';
        }
      }
      this.showLoading(false);
    }
  }

  /**
   * Berechnet Statistiken NUR aus Flügen der aktuellen Saison
   * ALLE Statistiken beziehen sich auf das aktuelle Jahr
   */
  calculateAllFlightsStats(pilots) {
    if (!Array.isArray(pilots)) {
      console.error("pilots ist kein Array:", pilots);
      return {
        totalPilots: 0,
        totalFlights: 0,
        totalKm: 0,
        longestFlight: 0,
        longestFlightPilot: '',
        maxWeGlidePoints: 0,
        maxWeGlidePointsPilot: ''
      };
    }

    const currentYear = new Date().getFullYear(); // 2025

    // Statistik-Variablen - NUR für aktuelle Saison
    let totalFlights = 0;
    let totalKm = 0;
    let longestFlight = 0;
    let longestFlightPilot = '';
    let maxWeGlidePoints = 0;
    let maxWeGlidePointsPilot = '';

    // Zähle nur Piloten mit Flügen in der aktuellen Saison
    const activePilots = new Set();

    pilots.forEach(pilot => {
      if (!pilot) return;

      const allFlights = pilot.allFlights || [];
      let pilotHasCurrentYearFlights = false;

      allFlights.forEach(flight => {
        if (!flight) return;

        // Prüfe ob Flug aus aktueller Saison
        const flightYear = flight.flightYear || new Date(flight.date).getFullYear();

        // NUR Flüge aus dem aktuellen Jahr zählen
        if (flightYear === currentYear) {
          // Pilot hat Flüge in diesem Jahr
          pilotHasCurrentYearFlights = true;

          // Zähle Flug
          totalFlights++;

          // Addiere Kilometer
          totalKm += flight.km || 0;

          // Prüfe längsten Flug
          if ((flight.km || 0) > longestFlight) {
            longestFlight = flight.km || 0;
            longestFlightPilot = pilot.name;
          }

          // Prüfe maximale WeGlide Punkte
          if ((flight.originalPoints || 0) > maxWeGlidePoints) {
            maxWeGlidePoints = flight.originalPoints || 0;
            maxWeGlidePointsPilot = pilot.name;
          }
        }
      });

      // Zähle Pilot nur wenn er Flüge im aktuellen Jahr hat
      if (pilotHasCurrentYearFlights) {
        activePilots.add(pilot.name);
      }
    });

    const stats = {
      totalPilots: activePilots.size, // Nur Piloten mit Flügen in 2025
      totalFlights,                    // Nur Flüge aus 2025
      totalKm,                         // Nur Kilometer aus 2025
      longestFlight,                   // Längster Flug aus 2025
      longestFlightPilot,
      maxWeGlidePoints,                // Max Punkte aus 2025
      maxWeGlidePointsPilot,
      season: currentYear
    };

    console.log(`📊 Statistiken für Saison ${currentYear}:`);
    console.log(`  → ${activePilots.size} aktive Teilnehmer`);
    console.log(`  → ${totalFlights} Flüge`);
    console.log(`  → ${totalKm.toFixed(0)} km gesamt`);
    console.log(`  → Längster Flug: ${longestFlight.toFixed(0)} km von ${longestFlightPilot}`);
    console.log(`  → Max WeGlide Punkte: ${maxWeGlidePoints} von ${maxWeGlidePointsPilot}`);

    return stats;
  }

  /**
   * Überprüft, ob ein Flug einen Fluglehrer als Co-Pilot hat
   */
  hasFlightInstructor(flight) {
    if (!flight || !flight.rawData) return false;

    // Liste der Fluglehrer (aus der CONFIG)
    const flightInstructors = [
      "Guido Halter",
      "Kurt Sauter",
      "Werner Rissi",
      "Heinz Bärfuss",
      "Roman Bühler",
      "Roman Andreas Buehler",
      "Roger Larpin",
      "Sg Saentis"
    ];

    // Co-Pilot-Name extrahieren
    let coPilotName = null;

    if (flight.rawData.co_user) {
      if (typeof flight.rawData.co_user === 'object' && flight.rawData.co_user.name) {
        coPilotName = flight.rawData.co_user.name;
      } else if (typeof flight.rawData.co_user === 'string') {
        coPilotName = flight.rawData.co_user;
      }
    }

    if (flight.rawData.co_user_name) {
      coPilotName = flight.rawData.co_user_name;
    }

    // Prüfen ob Co-Pilot ein Fluglehrer ist
    return coPilotName && flightInstructors.includes(coPilotName);
  }

  /**
   * Filtert die Pilotendaten basierend auf dem Suchbegriff
   */
  getFilteredPilots() {
    if (!this.pilotData) return [];
    if (!this.searchTerm) return this.pilotData;

    return this.pilotData.filter(pilot =>
      pilot.name.toLowerCase().includes(this.searchTerm)
    );
  }

  /**
   * Aktualisiert die Benutzeroberfläche
   */
  updateUI() {
    if (!this.pilotData) return;

    const filteredPilots = this.getFilteredPilots();

    console.log(`📊 UpdateUI für Tab: ${this.activeTab}`);

    // Statistiken und Datenquelle immer aktualisieren
    this.updateStatisticsDisplay();
    this.updateDataSourceDisplay();

    // Tab-spezifische Updates
    switch (this.activeTab) {
      case 'flightdetails':
        renderLatestClubFlights(filteredPilots);
        break;

      case 'rangliste':
        renderRankingTable(filteredPilots);
        // Info-Icon zum Ranking-Titel hinzufügen
        setTimeout(() => {
          this.addInfoIconToTitle();
        }, 100);
        break;

      case 'badges':
        console.log('🏅 Badge-Tab aktiv - rendere Badges');
        this.updateBadgeDisplay(filteredPilots);
        break;

      case 'statistics':
        renderAllCharts(filteredPilots);
        break;
    }

    // Datum in der Ranglisten-Fußzeile aktualisieren
    const dateElement = document.getElementById('ranking-date');
    if (dateElement) {
      dateElement.textContent = formatDateForDisplay(new Date());
    }
  }

  /**
 * Aktualisiert die Badge-Anzeige
 */
  async updateBadgeDisplay(pilots) {
    const container = document.getElementById('badge-ranking-container');
    if (!container) {
      console.error('❌ Badge-Container nicht gefunden!');
      return;
    }

    console.log('🏅 updateBadgeDisplay aufgerufen');
    console.log('   Anzahl Piloten:', pilots.length);

    // Debug: Zeige Badge-Status aller Piloten
    pilots.forEach(pilot => {
      if (pilot.badgeCount > 0 || pilot.flightsAnalyzed > 0) {
        console.log(`   ${pilot.name}: ${pilot.badgeCount} Badges aus ${pilot.flightsWithBadges}/${pilot.flightsAnalyzed} Flügen`);
      }
    });

    // Prüfe ob Badges geladen sind
    const pilotsWithBadges = pilots.filter(p => p.badgeCount !== undefined && p.badgeCount > 0);

    console.log(`   → ${pilotsWithBadges.length} Piloten mit Badges gefunden`);

    if (pilotsWithBadges.length === 0) {
      // Prüfe ob überhaupt Flüge analysiert wurden
      const pilotsWithAnalyzedFlights = pilots.filter(p => p.flightsAnalyzed > 0);
      const totalFlightsAnalyzed = pilots.reduce((sum, p) => sum + (p.flightsAnalyzed || 0), 0);

      container.innerHTML = `
      <div class="badges-loading">
        <h2 class="section-title">🏅 WeGlide Badges Saison 2024/2025</h2>
        <div class="no-data">
          <p>Keine Badges in der Saison 2024/2025 gefunden.</p>
          <p style="font-size: 14px; color: #666; margin-top: 10px;">
            ${totalFlightsAnalyzed} Flüge von ${pilotsWithAnalyzedFlights.length} Piloten wurden analysiert.
          </p>
          <p style="font-size: 12px; color: #888; margin-top: 10px;">
            Es werden nur Badges aus Flügen seit dem 1. Oktober 2024 (Saisonbeginn) gezählt.
          </p>
          ${totalFlightsAnalyzed === 0 ?
          `<p style="font-size: 12px; color: #d73502; margin-top: 15px;">
              ⚠️ Es wurden keine Flüge analysiert. Möglicherweise ein Ladefehler.
            </p>` : ''
        }
        </div>
      </div>
    `;

      // Debug-Info ausgeben wenn keine Badges gefunden
      console.log('📊 Badge-Analyse Zusammenfassung:');
      console.log(`   Piloten gesamt: ${pilots.length}`);
      console.log(`   Piloten mit analysierten Flügen: ${pilotsWithAnalyzedFlights.length}`);
      console.log(`   Flüge analysiert gesamt: ${totalFlightsAnalyzed}`);

      // Zeige Top 5 Piloten nach analysierten Flügen
      const topPilotsByFlights = [...pilots]
        .filter(p => p.flightsAnalyzed > 0)
        .sort((a, b) => b.flightsAnalyzed - a.flightsAnalyzed)
        .slice(0, 5);

      if (topPilotsByFlights.length > 0) {
        console.log('   Top Piloten nach analysierten Flügen:');
        topPilotsByFlights.forEach(p => {
          console.log(`     - ${p.name}: ${p.flightsAnalyzed} Flüge`);
        });
      }

    } else {
      // Badges sind vorhanden - zeige sie an
      console.log(`✅ ${pilotsWithBadges.length} Piloten mit Badges gefunden`);

      // Debug: Zeige Top 5 Piloten mit Badges
      const topPilots = [...pilotsWithBadges]
        .sort((a, b) => b.badgeCount - a.badgeCount)
        .slice(0, 5);

      console.log('🏆 Top 5 Piloten mit Badges:');
      topPilots.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name}: ${p.badgeCount} Badges`);
      });

      // Rendere die Badge-Rangliste
      renderBadgeRanking(pilots, 'badge-ranking-container');

      // Icons zu Tabellen-Headers hinzufügen
      setTimeout(() => {
        this.addSVGIconsToTableHeaders();
      }, 100);
    }

    // Zusätzliche Debug-Funktion aufrufen
    if (window.debugBadgeStatus && typeof debugBadgeStatus === 'function') {
      debugBadgeStatus(pilots);
    }
  }

  /**
   * Aktualisiert die Statistik-Anzeige mit Floating Tags
   * FLOATING TAG VARIANTE - Mit Saison-Labels
   */
  updateStatisticsDisplay() {
    if (!this.stats) return;

    const currentYear = new Date().getFullYear();

    // Einfache Statistiken ohne Piloten-Info
    const simpleElements = {
      'total-pilots': this.stats.totalPilots || 0,
      'total-flights': this.stats.totalFlights || 0,
      'total-km': formatNumber(this.stats.totalKm || 0)
    };

    // Einfache Stats aktualisieren
    for (const [id, value] of Object.entries(simpleElements)) {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;

        // Update Label mit Jahreszahl
        const card = element.closest('.stat-card');
        if (card) {
          const label = card.querySelector('.stat-label');
          if (label) {
            switch (id) {
              case 'total-pilots':
                label.textContent = `Teilnehmer ${currentYear}`;
                break;
              case 'total-flights':
                label.textContent = `Flüge ${currentYear}`;
                break;
              case 'total-km':
                label.textContent = `Kilometer ${currentYear}`;
                break;
            }
          }

          // Stelle sicher, dass die Card keine Pilot-Klassen hat
          card.classList.remove('stat-card-with-pilot', 'stat-important');
          // Entferne eventuell vorhandene Pilot-Tags
          const existingTag = card.querySelector('.stat-pilot-tag');
          if (existingTag) existingTag.remove();
        }
      }
    }

    // Längster Flug mit Floating Pilot Tag
    const longestFlightElement = document.getElementById('longest-flight');
    if (longestFlightElement) {
      const roundedDistance = Math.round(this.stats.longestFlight || 0);
      longestFlightElement.textContent = `${formatNumber(roundedDistance)} km`;

      const card = longestFlightElement.closest('.stat-card');
      if (card) {
        // Update Label
        const label = card.querySelector('.stat-label');
        if (label) {
          label.textContent = `Längster Flug ${currentYear}`;
        }

        if (this.stats.longestFlightPilot && roundedDistance > 0) {
          // Füge Pilot-Klassen hinzu
          card.classList.add('stat-card-with-pilot', 'stat-important');

          // Entferne eventuell vorhandenen Tag
          const existingTag = card.querySelector('.stat-pilot-tag');
          if (existingTag) existingTag.remove();

          // Erstelle neuen Pilot Tag
          const pilotTag = document.createElement('div');
          pilotTag.className = 'stat-pilot-tag';

          // Nur Vorname für kompakte Darstellung
          //const firstName = (this.stats.longestFlightPilot || '').split(' ')[0];
          const firstName = this.stats.longestFlightPilot;
          pilotTag.textContent = firstName;

          // Tooltip mit vollständigem Namen
          pilotTag.title = `Längster Flug ${currentYear} von ${this.stats.longestFlightPilot}`;

          card.appendChild(pilotTag);
        }
      }
    }

    // Max. WeGlide Punkte mit Floating Pilot Tag
    const maxPointsElement = document.getElementById('max-points');
    if (maxPointsElement) {
      maxPointsElement.textContent = formatNumber((this.stats.maxWeGlidePoints || 0).toFixed(0));

      const card = maxPointsElement.closest('.stat-card');
      if (card) {
        // Update Label
        const label = card.querySelector('.stat-label');
        if (label) {
          label.textContent = `Max. Punkte ${currentYear}`;
        }

        if (this.stats.maxWeGlidePointsPilot && this.stats.maxWeGlidePoints > 0) {
          // Füge Pilot-Klassen hinzu
          card.classList.add('stat-card-with-pilot', 'stat-important');

          // Entferne eventuell vorhandenen Tag
          const existingTag = card.querySelector('.stat-pilot-tag');
          if (existingTag) existingTag.remove();

          // Erstelle neuen Pilot Tag
          const pilotTag = document.createElement('div');
          pilotTag.className = 'stat-pilot-tag';

          // Nur Vorname für kompakte Darstellung
          //const firstName = (this.stats.maxWeGlidePointsPilot || '').split(' ')[0];
          const firstName = this.stats.maxWeGlidePointsPilot;
          pilotTag.textContent = firstName;

          // Tooltip mit vollständigem Namen
          pilotTag.title = `Max. WeGlide Punkte ${currentYear} von ${this.stats.maxWeGlidePointsPilot}`;

          card.appendChild(pilotTag);
        }
      }
    }

    console.log(`Statistik-Anzeige für Saison ${currentYear} aktualisiert`);
  }

  /**
   * Aktualisiert die Anzeige der Datenquelle
   */
  updateDataSourceDisplay() {
    const dataSource = document.getElementById('data-source');
    if (dataSource) {
      dataSource.textContent = `Daten von: ${this.dataSource}`;

      if (this.dataSource.includes('WeGlide')) {
        dataSource.classList.add('live-data');
      } else {
        dataSource.classList.remove('live-data');
      }
    }
  }

  /**
   * Zeigt oder versteckt die Ladeanzeige
   */
  showLoading(show) {
    this.isLoading = show;

    const loadingElement = document.getElementById('loading-message');
    if (loadingElement) {
      loadingElement.style.display = show ? 'block' : 'none';
    }
  }

  /**
   * Zeigt eine Fehlermeldung an
   */
  showErrorMessage(message) {
    const errorElement = document.getElementById('api-error-message');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';

      // Nach 5 Sekunden ausblenden
      setTimeout(() => {
        errorElement.style.display = 'none';
      }, 5000);
    }
  }

  /**
   * Debug-Funktionen
   */
  debugStatistics() {

    if (!this.stats) {
      console.log('Keine Statistiken verfügbar');
      return;
    }

    const currentYear = new Date().getFullYear();
    console.group(`📊 Statistiken Saison ${currentYear}`);
    console.log('Teilnehmer:', this.stats.totalPilots);
    console.log('Flüge:', this.stats.totalFlights);
    console.log('Kilometer:', this.stats.totalKm);
    console.log('Längster Flug:', this.stats.longestFlight, 'km von', this.stats.longestFlightPilot);
    console.log('Max. WeGlide Punkte:', this.stats.maxWeGlidePoints, 'von', this.stats.maxWeGlidePointsPilot);
    console.groupEnd();
  }



  debugTableHeaders() {
    const headers = document.querySelectorAll('.ranking-table th');
    console.group('🏷️ Tabellen-Header Debug');
    headers.forEach((header, index) => {
      console.log(`Header ${index + 1}: "${header.textContent.trim()}"`);
      console.log('  - Hat Icon:', !!header.querySelector('.table-header-icon'));
      console.log('  - Classes:', header.className);
    });
    console.groupEnd();
  }
}



// Anwendung starten, wenn das DOM geladen ist
document.addEventListener('DOMContentLoaded', () => {
  const app = new SGSaentisCupApp();
  app.init();
});

export { SGSaentisCupApp };

function findBadgeHistory(pilotName, badgeId) {
  // Finde den Piloten
  console.log(`🔍 Suche Badge-Historie für ${pilotName} - Badge: ${badgeId}`);
  const pilot = window.pilotData?.find(p => p.name === pilotName);

  if (!pilot) {
    console.log(`Pilot ${pilotName} nicht gefunden`);
    return;
  }

  console.log(`\n🔍 Badge-Historie für ${pilotName} - Badge: ${badgeId}`);
  console.log('═══════════════════════════════════════════════════════');

  // Alle Badges dieses Typs
  const consistencyBadges = [];

  // Prüfe aktuelle Saison Badges
  if (pilot.badges && Array.isArray(pilot.badges)) {
    pilot.badges.forEach(badge => {
      if (badge.badge_id?.toLowerCase().includes(badgeId.toLowerCase())) {
        consistencyBadges.push({
          ...badge,
          source: 'Saison 2024/2025'
        });
      }
    });
  }

  // Prüfe All-Time Badges
  if (pilot.allTimeBadges && Array.isArray(pilot.allTimeBadges)) {
    pilot.allTimeBadges.forEach(badge => {
      if (badge.badge_id?.toLowerCase().includes(badgeId.toLowerCase())) {
        // Prüfe ob nicht schon in aktueller Saison
        const isDuplicate = consistencyBadges.some(b =>
          b.flight_id === badge.flight_id &&
          b.achieved_at === badge.achieved_at
        );

        if (!isDuplicate) {
          consistencyBadges.push({
            ...badge,
            source: 'Historisch'
          });
        }
      }
    });
  }

  // Sortiere nach Datum (älteste zuerst)
  consistencyBadges.sort((a, b) => {
    const dateA = new Date(a.achieved_at || a.flight_date || a.created);
    const dateB = new Date(b.achieved_at || b.flight_date || b.created);
    return dateA - dateB;
  });

  if (consistencyBadges.length === 0) {
    console.log(`❌ Keine ${badgeId} Badges gefunden für ${pilotName}`);
    return;
  }

  console.log(`✅ ${consistencyBadges.length} ${badgeId} Badge(s) gefunden:\n`);

  consistencyBadges.forEach((badge, index) => {
    const date = badge.achieved_at || badge.flight_date || badge.created;
    const formattedDate = date ? new Date(date).toLocaleDateString('de-DE') : 'Unbekannt';

    console.log(`${index + 1}. ${badge.name || badge.badge_id}`);
    console.log(`   📅 Datum: ${formattedDate}`);
    console.log(`   🎯 Level: ${badge.level || 'N/A'}`);
    console.log(`   📊 Wert: ${badge.value || badge.level_value || 'N/A'}`);
    console.log(`   ✈️ Flug-ID: ${badge.flight_id || 'N/A'}`);
    console.log(`   📁 Quelle: ${badge.source}`);
    console.log(`   🏅 Saison: ${badge.season || getSeasonForDate(date)}`);

    if (index === 0) {
      console.log(`\n   ⭐ ERSTES MAL ERREICHT AM: ${formattedDate} ⭐\n`);
    }

    console.log('   ─────────────────────────────────────');
  });

  // Zeige auch Flug-Details für den ersten Badge
  if (consistencyBadges.length > 0 && consistencyBadges[0].flight_id) {
    console.log(`\n📎 WeGlide-Link zum ersten Flug:`);
    console.log(`   https://www.weglide.org/flight/${consistencyBadges[0].flight_id}`);
  }
}

// Helper-Funktion für Saison-Bestimmung
function getSeasonForDate(dateString) {
  if (!dateString) return 'Unbekannt';
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (month >= 10) {
    return `${year}/${year + 1}`;
  } else {
    return `${year - 1}/${year}`;
  }
}

// Debug-Funktion für Badge-Berechnung
window.testBadgeCalculation = async function (pilotName) {
  console.log(`\n🧪 Teste Badge-Berechnung für ${pilotName}...`);

  const pilot = window.pilotData?.find(p => p.name === pilotName);
  if (!pilot) {
    console.error(`Pilot ${pilotName} nicht gefunden!`);
    return;
  }

  // Importiere die enhanced Version
  const { testBadgeCalculation } = await import('../services/badge-reverse-calculator-enhanced.js');

  const result = await testBadgeCalculation(pilot.userId, pilot.name);
  console.log('Ergebnis:', result);

  return result;
};

// Debug-Konsole für SG Säntis App
window.SGDebug = {
  // Cache leeren
  clearCache: async function () {
    const { apiClient } = await import('../services/weglide-api-service.js');
    apiClient.clearCache();
    console.log('✅ Cache geleert');
  },

  // Daten neu laden
  refresh: async function () {
    if (window.sgApp) {
      await window.sgApp.refreshData();
    } else {
      console.error('❌ App nicht initialisiert');
    }
  },

  // Badge-Berechnung testen
  testBadges: async function (pilotName) {
    const { testBadgeCalculation } = await import('../services/badge-reverse-calculator-enhanced.js');

    const pilot = window.pilotData?.find(p => p.name === pilotName);
    if (!pilot) {
      console.error(`❌ Pilot ${pilotName} nicht gefunden!`);
      console.log('Verfügbare Piloten:', window.pilotData?.map(p => p.name));
      return;
    }

    return await testBadgeCalculation(pilot.userId, pilot.name);
  },

  // Flugdetails abrufen
  getFlightDetails: async function (flightId) {
    const { apiClient } = await import('../services/weglide-api-service.js');
    return await apiClient.fetchFlightDetails(flightId);
  },

  // Alle Piloten anzeigen
  listPilots: function () {
    if (!window.pilotData) {
      console.error('❌ Keine Pilotendaten geladen');
      return;
    }

    console.table(window.pilotData.map(p => ({
      Name: p.name,
      ID: p.userId,
      Punkte: p.totalPoints?.toFixed(2),
      Badges: p.badgeCount || 0,
      Flüge: p.allFlights?.length || 0
    })));
  },

  // Badge-Status anzeigen
  showBadgeStatus: function () {
    if (!window.pilotData) {
      console.error('❌ Keine Pilotendaten geladen');
      return;
    }

    const withBadges = window.pilotData.filter(p => p.badgeCount > 0);
    console.log(`📊 Badge-Status:`);
    console.log(`   ${withBadges.length} von ${window.pilotData.length} Piloten haben Badges`);

    const top5 = [...withBadges]
      .sort((a, b) => b.badgeCount - a.badgeCount)
      .slice(0, 5);

    console.log('\n🏆 Top 5:');
    top5.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name}: ${p.badgeCount} Badges`);
    });
  },

  // Hilfe anzeigen
  help: function () {
    console.log(`
🛠️ SG Säntis Debug-Konsole
═══════════════════════════════════════════

Verfügbare Befehle:

📊 Daten:
  SGDebug.listPilots()           - Zeigt alle Piloten
  SGDebug.showBadgeStatus()      - Badge-Übersicht
  SGDebug.refresh()              - Lädt alle Daten neu
  SGDebug.clearCache()           - Leert den Cache

🏅 Badges:
  SGDebug.testBadges("Name")     - Testet Badge-Berechnung für einen Piloten
  SGDebug.getFlightDetails(123)  - Lädt Details für einen Flug

🔍 Beispiele:
  await SGDebug.testBadges("Guido Halter")
  await SGDebug.getFlightDetails(3838955)
  
📝 Globale Variablen:
  window.pilotData               - Alle Pilotendaten
  window.sgApp                   - App-Instanz
    `);
  }
};

// Zeige Hilfe beim Laden
console.log('✅ SG Säntis Debug-Konsole geladen. Tippe "SGDebug.help()" für Hilfe.');

// In main-app.js - Fügen Sie diese Debug-Funktion hinzu:

window.debugFlightLoading = function () {
  console.log('🔍 DEBUG: Flight Loading Status');
  console.log('================================');

  if (window.apiClient && apiClient._clubFlightsCache) {
    const cache = apiClient._clubFlightsCache;
    console.log('✅ Club-Flüge im Cache:', {
      flüge: cache.flights?.length || 0,
      mitglieder: cache.metadata?.memberCount || 0,
      zeitbereich: cache.metadata?.dateRange || 'N/A',
      cacheAge: apiClient._clubFlightsCacheTime ?
        `${Math.round((Date.now() - apiClient._clubFlightsCacheTime) / 60000)} Minuten` :
        'N/A'
    });
  } else {
    console.log('❌ Keine Club-Flüge im Cache');
  }

  if (window.pilotData) {
    const flightCounts = window.pilotData.map(p => ({
      name: p.name,
      flüge: p.allFlights?.length || 0,
      ältesterFlug: p.allFlights && p.allFlights.length > 0 ?
        new Date(Math.min(...p.allFlights.map(f =>
          new Date(f.date || f.scoring_date || f.takeoff_time)
        ))).toLocaleDateString() : 'N/A'
    }));

    console.table(flightCounts);
  }
};
