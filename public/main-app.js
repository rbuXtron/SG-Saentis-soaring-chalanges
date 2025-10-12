/**
 * SG Säntis Cup - Hauptanwendung
 * Version 4.0 - Bereinigt mit Loading Manager
 */

import { formatNumber, formatDateForDisplay, showNotification } from '../utils/utils.js';
import { apiClient } from '../services/weglide-api-service.js';
import { fetchAllWeGlideDataForSeason } from '../core/data-processor.js';
import { renderRankingTable, renderLatestClubFlights } from '../components/ranking-component.js';
import { renderAllCharts } from '../components/chart-generators.js';
import { renderBadgeRanking } from '../components/badges-component.js';
import { dataLoadingManager } from '../services/data-loading-manager.js';
import { SVG_ICONS } from './utils/svg-icons.js';
import { getLoadingManager } from './utils/loading-manager.js';

/**
 * Hauptklasse für die SG Säntis Cup Anwendung
 */
class SGSaentisCupApp {
  constructor() {
    // Aktuelle Saison bestimmen
    this.currentSeason = this.getCurrentSeasonYear();
    localStorage.setItem('selectedSeason', this.currentSeason);

    // State
    this.pilotData = null;
    this.stats = null;
    this.sprintStats = null;
    this.activeTab = 'flightdetails';
    this.dataSource = 'WeGlide API';
    this.searchTerm = '';
    
    // Loading Manager
    this.loadingManager = getLoadingManager();
    
    // Tooltip State
    this.tooltipInitialized = false;
    this.currentTooltip = null;
  }

  /**
   * Bestimmt das aktuelle Saison-Jahr basierend auf Datum
   * Oktober-Dezember: Nächstes Jahr (2025 -> 2026)
   * Januar-September: Aktuelles Jahr (2025 -> 2025)
   */
  getCurrentSeasonYear() {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();
    return month >= 10 ? (year + 1).toString() : year.toString();
  }

  /**
   * Initialisierung der App
   */
  async init() {
    console.log('🚀 Initialisiere SG Säntis Cup App...');

    this.setupEventHandlers();
    this.setupTabHandling();
    this.setupSearchHandling();
    this.setupSeasonSelector();
    this.updatePageTitle(this.currentSeason);

    // Initial Load mit Loading Manager
    await this.initialLoad();
  }

  /**
   * Initial Load mit Progress-Anzeige
   */
  async initialLoad() {
    console.log('📦 Starte initialen Daten-Load...');
    
    this.loadingManager.start(this.currentSeason);

    try {
      // Lade Daten
      const result = await fetchAllWeGlideDataForSeason(this.currentSeason);
      
      this.pilotData = result.pilots || [];
      this.stats = result.stats || {};
      this.sprintStats = result.sprintStats || {};
      window.pilotData = this.pilotData;

      // Loading Complete
      this.loadingManager.complete({
        totalPilots: this.pilotData.length,
        totalFlights: this.stats.totalFlights || 0
      });

      // UI aktualisieren
      this.updateUI();
      
      console.log('✅ Initiales Laden abgeschlossen');

    } catch (error) {
      console.error('❌ Fehler beim initialen Laden:', error);
      this.loadingManager.error(
        'Daten konnten nicht geladen werden',
        error.message
      );
    }
  }

  /**
   * Setup für Season Selector
   */
  setupSeasonSelector() {
    const seasonSelector = document.getElementById('season-select');
    if (!seasonSelector) return;

    seasonSelector.value = this.currentSeason;

    seasonSelector.addEventListener('change', async (e) => {
      const newSeason = e.target.value;
      const seasonString = newSeason === '2026' ? '2025/2026' : '2024/2025';
      console.log(`🔄 Wechsle zu Saison ${seasonString}`);

      // Start Loading
      this.loadingManager.start(newSeason);

      try {
        // Cache leeren
        apiClient.clearCache();
        dataLoadingManager.clearCache();

        // Update State
        this.currentSeason = newSeason;
        localStorage.setItem('selectedSeason', newSeason);
        this.updatePageTitle(newSeason);

        // Daten laden
        const result = await fetchAllWeGlideDataForSeason(newSeason);
        
        this.pilotData = result.pilots || [];
        this.stats = result.stats || {};
        this.sprintStats = result.sprintStats || {};
        window.pilotData = this.pilotData;

        // Complete
        this.loadingManager.complete({
          totalPilots: this.pilotData.length,
          totalFlights: this.stats.totalFlights || 0
        });

        // UI aktualisieren
        this.updateUI();

      } catch (error) {
        console.error('❌ Fehler beim Saison-Wechsel:', error);
        this.loadingManager.error(
          'Daten konnten nicht geladen werden',
          error.message
        );
      }
    });
  }

  /**
   * Event-Handler Setup
   */
  setupEventHandlers() {
    const refreshButton = document.getElementById('refresh-button');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this.refreshData());
    }
  }

  /**
   * Tab-Handling Setup
   */
  setupTabHandling() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    console.log(`🔍 Gefundene Tabs: ${tabs.length}`);

    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = tab.getAttribute('data-tab');

        console.log(`🔄 Tab-Wechsel zu: ${tabId}`);

        // Alle Tabs deaktivieren
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Aktuellen Tab aktivieren
        tab.classList.add('active');
        const content = document.getElementById(tabId);
        if (content) {
          content.classList.add('active');
          this.activeTab = tabId;
          this.renderTabContent(tabId);
        }
      });
    });
  }

  /**
   * Rendert Tab-Inhalt
   */
  renderTabContent(tabId) {
    console.log(`🎨 Rendere Tab-Content für: ${tabId}`);

    if (!this.pilotData || this.pilotData.length === 0) {
      console.warn('⚠️ Keine Pilotdaten verfügbar');
      return;
    }

    const filteredPilots = this.getFilteredPilots();
    console.log(`   Gefilterte Piloten: ${filteredPilots.length}`);

    switch (tabId) {
      case 'flightdetails':
        renderLatestClubFlights(filteredPilots);
        break;
      case 'rangliste':
        renderRankingTable(filteredPilots);
        setTimeout(() => this.addInfoIconToTitle(), 100);
        break;
      case 'badges':
        renderBadgeRanking(filteredPilots);
        break;
      case 'statistics':
        renderAllCharts(filteredPilots);
        break;
      default:
        console.warn(`⚠️ Unbekannter Tab: ${tabId}`);
    }
  }

  /**
   * Such-Handler Setup
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
   * Daten aktualisieren
   */
  async refreshData() {
    const refreshButton = document.getElementById('refresh-button');
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = 'Aktualisiere...';
    }

    // Start Loading
    this.loadingManager.start(this.currentSeason);

    try {
      // Cache leeren
      apiClient.clearCache();
      dataLoadingManager.clearCache();

      // Daten neu laden
      const result = await fetchAllWeGlideDataForSeason(this.currentSeason);
      
      this.pilotData = result.pilots || [];
      this.stats = result.stats || {};
      this.sprintStats = result.sprintStats || {};
      window.pilotData = this.pilotData;

      // Complete
      this.loadingManager.complete({
        totalPilots: this.pilotData.length,
        totalFlights: this.stats.totalFlights || 0
      });

      // UI aktualisieren
      this.updateUI();

    } catch (error) {
      console.error('❌ Fehler bei der Aktualisierung:', error);
      this.loadingManager.error(
        'Aktualisierung fehlgeschlagen',
        error.message
      );
    } finally {
      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent = 'Daten aktualisieren';
      }
    }
  }

  /**
   * Filtert Piloten nach Suchbegriff
   */
  getFilteredPilots() {
    if (!this.pilotData) return [];
    if (!this.searchTerm) return this.pilotData;

    return this.pilotData.filter(pilot =>
      pilot.name.toLowerCase().includes(this.searchTerm)
    );
  }

  /**
   * UI aktualisieren
   */
  updateUI() {
    if (!this.pilotData) {
      console.warn('⚠️ Keine Pilotdaten zum Anzeigen');
      return;
    }

    console.log(`📊 Update UI mit ${this.pilotData.length} Piloten`);

    this.updateStatisticsDisplay();
    this.updateDataSourceDisplay();

    // Aktiven Tab neu rendern
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
      const tabId = activeTab.getAttribute('data-tab');
      console.log(`🎯 Rendere aktiven Tab: ${tabId}`);
      this.renderTabContent(tabId);
    } else {
      console.warn('⚠️ Kein aktiver Tab gefunden');
      this.renderTabContent('flightdetails');
    }
  }

  /**
   * Aktualisiert Statistik-Anzeige
   */
  updateStatisticsDisplay() {
    if (!this.stats) return;

    // Einfache Statistiken
    const simpleElements = {
      'total-pilots': this.stats.totalPilots || 0,
      'total-flights': this.stats.totalFlights || 0,
      'total-km': formatNumber(this.stats.totalKm || 0)
    };

    Object.entries(simpleElements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });

    // Längster Flug mit Tooltip
    if (this.stats.longestFlight && this.stats.longestFlightPilot) {
      this.addStatTooltip('longest-flight', this.stats.longestFlight, 'longest-flight');
    } else {
      const element = document.getElementById('longest-flight');
      if (element) {
        element.textContent = `${formatNumber(Math.round(this.stats.longestFlight || 0))} km`;
      }
    }

    // Max Punkte mit Tooltip
    if (this.stats.maxWeGlidePoints && this.stats.maxWeGlidePointsPilot) {
      this.addStatTooltip('max-points', this.stats.maxWeGlidePoints, 'max-points');
    } else {
      const element = document.getElementById('max-points');
      if (element) {
        element.textContent = formatNumber((this.stats.maxWeGlidePoints || 0).toFixed(0));
      }
    }
  }

  /**
   * Fügt Tooltip zu Statistik-Karte hinzu
   */
  addStatTooltip(elementId, value, tooltipType) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Wert setzen
    if (elementId === 'longest-flight') {
      element.textContent = `${formatNumber(Math.round(value || 0))} km`;
    } else if (elementId === 'max-points') {
      element.textContent = formatNumber((value || 0).toFixed(0));
    }

    const card = element.closest('.stat-card');
    if (!card || !value) return;

    // Tooltip-Container erstellen
    let tooltipContainer = card.querySelector('.tooltip-container');
    if (!tooltipContainer) {
      tooltipContainer = document.createElement('div');
      tooltipContainer.className = 'tooltip-container stat-tooltip-container';

      const infoIcon = document.createElement('div');
      infoIcon.className = 'info-icon info-icon-svg stat-info-icon';
      infoIcon.innerHTML = SVG_ICONS.info;
      infoIcon.setAttribute('tabindex', '0');
      infoIcon.setAttribute('role', 'button');
      infoIcon.setAttribute('aria-label', 'Weitere Informationen');

      const tooltipContent = this.createTooltipContent(tooltipType);

      tooltipContainer.appendChild(infoIcon);
      tooltipContainer.appendChild(tooltipContent);
      card.appendChild(tooltipContainer);

      // Event Handler
      infoIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        const isActive = tooltipContainer.classList.contains('active');
        this.closeAllTooltips();

        if (!isActive) {
          this.showTooltip(tooltipContainer);
        }
      });

      infoIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          infoIcon.click();
        } else if (e.key === 'Escape') {
          this.closeAllTooltips();
        }
      });
    }
  }

  /**
   * Zeigt Tooltip an
   */
  showTooltip(tooltipContainer) {
    tooltipContainer.classList.add('active');
  }

  /**
   * Schließt alle Tooltips
   */
  closeAllTooltips() {
    document.querySelectorAll('.tooltip-container.active').forEach(container => {
      container.classList.remove('active');
    });
  }

  /**
   * Datenquelle anzeigen
   */
  updateDataSourceDisplay() {
    const dataSource = document.getElementById('data-source');
    if (dataSource) {
      const now = new Date();
      const timeString = now.toLocaleTimeString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      dataSource.innerHTML = `
        ✓ Daten von WeGlide API 
        <span class="data-timestamp">(${timeString})</span>
      `;
    }
  }

  /**
   * Aktualisiert den Seitentitel basierend auf der Saison
   */
  updatePageTitle(seasonYear) {
    const seasonString = seasonYear === '2026' ? '2025/2026' : '2024/2025';
    const yearDisplay = seasonYear === '2026' ? '2026' : '2025';

    // Browser-Tab Titel
    document.title = `SG Säntis Soaring Challenge ${yearDisplay}`;

    // Header-Titel
    const mainTitle = document.querySelector('.header-title, h1#main-title, .main-title');
    if (mainTitle) {
      mainTitle.textContent = `SG Säntis Soaring Challenge ${yearDisplay}`;
    }

    // Saison-Anzeige
    const seasonDisplay = document.querySelector('.season-display, .current-season-text');
    if (seasonDisplay) {
      seasonDisplay.textContent = `Saison ${seasonString}`;
    }

    console.log(`📝 Titel aktualisiert: SG Säntis Soaring Challenge ${yearDisplay}`);
  }

  /**
   * Fügt Info-Icon mit Tooltip zur Überschrift hinzu
   */
  addInfoIconToTitle() {
    if (document.querySelector('.ranking-header .info-icon, .ranking-header .info-icon-svg')) {
      return;
    }

    const titleElements = [
      document.querySelector('.ranking-header h2'),
      document.querySelector('.ranking-header .section-title'),
      ...document.querySelectorAll('h1, h2, h3, h4, h5, h6')
    ].filter(Boolean);

    const targetTitle = titleElements.find(el =>
      el?.textContent?.includes('SG Säntis Cup') ||
      el?.textContent?.includes('Säntis Cup') ||
      el?.textContent?.includes('Rangliste')
    );

    if (targetTitle) {
      this.addInfoIconToElement(targetTitle);
    }
  }

  /**
   * Fügt SVG Info-Icon zu einem Element hinzu
   */
  addInfoIconToElement(targetElement) {
    if (!targetElement) return;

    try {
      const titleContainer = document.createElement('div');
      titleContainer.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
      `;

      const textSpan = document.createElement('span');
      textSpan.textContent = targetElement.textContent.trim();
      titleContainer.appendChild(textSpan);

      const tooltipContainer = this.createTooltipContainer();
      titleContainer.appendChild(tooltipContainer);

      targetElement.innerHTML = '';
      targetElement.appendChild(titleContainer);

      setTimeout(() => this.initializeTooltips(), 100);
    } catch (error) {
      console.error('Fehler beim Hinzufügen des Info-Icons:', error);
    }
  }

  /**
   * Erstellt den Tooltip-Container
   */
  createTooltipContainer() {
    const tooltipContainer = document.createElement('div');
    tooltipContainer.className = 'tooltip-container';

    const infoIcon = document.createElement('div');
    infoIcon.className = 'info-icon info-icon-svg';
    infoIcon.innerHTML = SVG_ICONS.info;
    infoIcon.setAttribute('tabindex', '0');
    infoIcon.setAttribute('role', 'button');
    infoIcon.setAttribute('aria-label', 'Vollständige Informationen zur Punkteberechnung');

    const tooltipContent = this.createTooltipContent('ranking');

    tooltipContainer.appendChild(infoIcon);
    tooltipContainer.appendChild(tooltipContent);

    return tooltipContainer;
  }

  /**
   * Erstellt den Tooltip-Inhalt
   */
  createTooltipContent(type = 'ranking') {
    const tooltipContent = document.createElement('div');
    tooltipContent.className = 'tooltip-content';
    tooltipContent.setAttribute('role', 'tooltip');
    tooltipContent.setAttribute('aria-hidden', 'true');

    if (type === 'ranking') {
      tooltipContent.innerHTML = `
        <h4 class="tooltip-title">SG Säntis Cup - Punktesystem</h4>
        
        <div class="section-title">Grundformel</div>
        <p class="tooltip-text"><strong>Punkte = Distanz × P-Faktor × Flz-Faktor × Startplatzfaktor</strong></p>
        <p class="tooltip-text">Die drei besten Flüge werden für die Gesamtwertung herangezogen.</p>
        
        <div class="section-title">Pilotenfaktor (P-Faktor)</div>
        <p class="tooltip-text">Basiert auf der größten geflogenen Distanz (alle Flüge seit 2023):</p>
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
        
        <div class="tooltip-highlight" style="background: rgba(255, 159, 64, 0.1); border-color: #ff9f40;">
          <strong>⚠️ Wichtig:</strong> Bei Flügen mit Fluglehrer wird der jeweilige Pilotenfaktor des Fluglehrers verwendet, nicht der eigene Faktor.
        </div>
        
        <div class="section-title">Flugzeugfaktor (Flz-Faktor)</div>
        <p class="tooltip-text">Berücksichtigt die unterschiedlichen Leistungen verschiedener Flugzeugtypen.</p>
        <p class="tooltip-text"><strong>Beispiele:</strong> Discus 2T = 0.769, DG-300 = 0.925, JS1-21 = 0.630</p>
        
        <div class="section-title">Startplatzfaktor</div>
        <ul class="tooltip-list">
          <li><strong>St. Gallen-Altenrhein:</strong> Faktor 1.0 (100%)</li>
          <li><strong>Andere Startplätze:</strong> Faktor 0.8 (80%)</li>
        </ul>
        
        <div class="tooltip-highlight">
          <strong>Fairness-System:</strong> Der Pilotenfaktor sorgt für Chancengleichheit zwischen erfahrenen und neuen Piloten.
        </div>
      `;
    }
    else if (type === 'longest-flight' && this.stats) {
      tooltipContent.className = 'tooltip-content tooltip-mini';
      tooltipContent.innerHTML = `
        <h4 class="tooltip-title-mini">Längster Flug</h4>
        <div class="tooltip-mini-info">
          <div class="mini-row">
            <span class="mini-label">Pilot:</span>
            <span class="mini-value">${this.stats.longestFlightPilot || 'N/A'}</span>
          </div>
          <div class="mini-row">
            <span class="mini-label">Distanz:</span>
            <span class="mini-value"><strong>${formatNumber(Math.round(this.stats.longestFlight || 0))} km</strong></span>
          </div>
          ${this.stats.longestFlightDate ? `
          <div class="mini-row">
            <span class="mini-label">Datum:</span>
            <span class="mini-value">${formatDateForDisplay(this.stats.longestFlightDate)}</span>
          </div>
          ` : ''}
        </div>
      `;
    }
    else if (type === 'max-points' && this.stats) {
      tooltipContent.className = 'tooltip-content tooltip-mini';
      tooltipContent.innerHTML = `
        <h4 class="tooltip-title-mini">Max. WeGlide Punkte</h4>
        <div class="tooltip-mini-info">
          <div class="mini-row">
            <span class="mini-label">Pilot:</span>
            <span class="mini-value">${this.stats.maxWeGlidePointsPilot || 'N/A'}</span>
          </div>
          <div class="mini-row">
            <span class="mini-label">Punkte:</span>
            <span class="mini-value"><strong>${formatNumber((this.stats.maxWeGlidePoints || 0).toFixed(0))}</strong></span>
          </div>
          ${this.stats.maxWeGlidePointsDate ? `
          <div class="mini-row">
            <span class="mini-label">Datum:</span>
            <span class="mini-value">${formatDateForDisplay(this.stats.maxWeGlidePointsDate)}</span>
          </div>
          ` : ''}
        </div>
      `;
    }

    return tooltipContent;
  }

  /**
   * Initialisiert Tooltips
   */
  initializeTooltips() {
    if (this.tooltipInitialized) return;

    const infoIcons = document.querySelectorAll('.info-icon, .info-icon-svg');
    
    if (infoIcons.length === 0) {
      setTimeout(() => this.initializeTooltips(), 500);
      return;
    }

    infoIcons.forEach(icon => {
      if (icon.hasAttribute('data-tooltip-initialized')) return;
      icon.setAttribute('data-tooltip-initialized', 'true');
    });

    this.tooltipInitialized = true;
  }

  /**
   * Helper: Sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// App starten
document.addEventListener('DOMContentLoaded', () => {
  const app = new SGSaentisCupApp();
  app.init();

  // Global verfügbar machen für Debugging
  window.sgApp = app;
});

// Debug-Konsole
window.SGDebug = {
  clearCache: () => {
    apiClient.clearCache();
    console.log('✅ Cache geleert');
  },

  refresh: async () => {
    if (window.sgApp) {
      await window.sgApp.refreshData();
    }
  },

  listPilots: () => {
    console.table(window.pilotData?.map(p => ({
      Name: p.name,
      ID: p.userId,
      Punkte: p.totalPoints?.toFixed(2),
      Badges: p.badgeCount || 0,
      Flüge: p.allFlights?.length || 0
    })));
  },

  help: () => {
    console.log(`
🛠️ SG Säntis Debug-Konsole
════════════════════════════

Befehle:
  SGDebug.clearCache()    - Cache leeren
  SGDebug.refresh()       - Daten neu laden
  SGDebug.listPilots()    - Piloten anzeigen
  SGDebug.help()          - Diese Hilfe
    `);
  }
};

console.log('✅ SG Säntis App geladen. Tippe "SGDebug.help()" für Hilfe.');

export { SGSaentisCupApp };