/**
 * Loading Manager für SG Säntis Soaring Challenge
 * Verwaltet Ladezustände mit Progress-Feedback
 */

export class LoadingManager {
  constructor() {
    this.phases = {
      INIT: 'init',
      FETCHING: 'fetching',
      PROCESSING: 'processing',
      RENDERING: 'rendering',
      COMPLETE: 'complete',
      ERROR: 'error'
    };

    this.currentPhase = null;
    this.startTime = null;
    this.elements = this.getElements();
    this.progressData = {
      totalPilots: 0,
      totalFlights: 0,
      currentPilot: 0
    };
  }

  /**
   * Holt alle relevanten DOM-Elemente
   */
  getElements() {
    return {
      loadingMessage: document.getElementById('loading-message'),
      errorMessage: document.getElementById('api-error-message'),
      successMessage: document.getElementById('update-success'),
      dataSource: document.getElementById('data-source'),
      refreshButton: document.getElementById('refresh-button'),
      flightsContainer: document.getElementById('latest-flights-container')
    };
  }

  /**
   * Startet den Ladeprozess
   */
  start(seasonYear) {
    this.startTime = Date.now();
    this.currentPhase = this.phases.INIT;
    
    console.log('🚀 Loading Manager gestartet für Saison', seasonYear);
    
    // Verstecke alle Nachrichten
    this.hideAllMessages();
    
    // Zeige initialen Ladebildschirm
    this.showInitialLoading(seasonYear);
    
    // Disable Refresh Button
    if (this.elements.refreshButton) {
      this.elements.refreshButton.disabled = true;
    }
  }

  /**
   * Phase 1: Initialisierung
   */
  showInitialLoading(seasonYear) {
    const seasonString = this.getSeasonString(seasonYear);
    
    if (this.elements.loadingMessage) {
      this.elements.loadingMessage.innerHTML = `
        <div class="loading-phase">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <strong>Lade Daten für Saison ${seasonString}...</strong>
            <div class="loading-subtext">Verbinde mit WeGlide API</div>
          </div>
        </div>
      `;
      this.elements.loadingMessage.style.display = 'flex';
    }

    // Zeige Skeleton in Flights Container
    if (this.elements.flightsContainer) {
      this.elements.flightsContainer.innerHTML = this.createSkeletonHTML();
    }
  }

  /**
   * Phase 2: Daten werden abgerufen
   */
  updateFetchingProgress(currentPilot, totalPilots) {
    this.currentPhase = this.phases.FETCHING;
    this.progressData.currentPilot = currentPilot;
    this.progressData.totalPilots = totalPilots;

    const percentage = Math.round((currentPilot / totalPilots) * 100);

    if (this.elements.loadingMessage) {
      this.elements.loadingMessage.innerHTML = `
        <div class="loading-phase">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <strong>Lade Flugdaten...</strong>
            <div class="loading-subtext">
              Pilot ${currentPilot} von ${totalPilots} (${percentage}%)
            </div>
            <div class="loading-progress-bar">
              <div class="loading-progress-fill" style="width: ${percentage}%"></div>
            </div>
          </div>
        </div>
      `;
    }
  }

  /**
   * Phase 3: Daten werden verarbeitet
   */
  updateProcessing(flightCount) {
    this.currentPhase = this.phases.PROCESSING;
    this.progressData.totalFlights = flightCount;

    if (this.elements.loadingMessage) {
      this.elements.loadingMessage.innerHTML = `
        <div class="loading-phase">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <strong>Verarbeite Daten...</strong>
            <div class="loading-subtext">
              ${flightCount} Flüge werden analysiert
            </div>
          </div>
        </div>
      `;
    }
  }

  /**
   * Phase 4: UI wird gerendert
   */
  updateRendering() {
    this.currentPhase = this.phases.RENDERING;

    if (this.elements.loadingMessage) {
      this.elements.loadingMessage.innerHTML = `
        <div class="loading-phase">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <strong>Bereite Anzeige vor...</strong>
            <div class="loading-subtext">Generiere Ranglisten und Charts</div>
          </div>
        </div>
      `;
    }
  }

  /**
   * Phase 5: Erfolgreich abgeschlossen
   */
  complete(stats) {
    this.currentPhase = this.phases.COMPLETE;
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);

    console.log(`✅ Laden abgeschlossen in ${duration}s`);
    console.log(`📊 ${stats.totalPilots} Piloten, ${stats.totalFlights} Flüge`);

    // Verstecke Loading
    if (this.elements.loadingMessage) {
      this.elements.loadingMessage.style.display = 'none';
    }

    // Zeige Success Message
    if (this.elements.successMessage) {
      this.elements.successMessage.innerHTML = `
        ✅ <strong>${stats.totalFlights} Flüge</strong> von 
        <strong>${stats.totalPilots} Piloten</strong> geladen 
        (${duration}s)
      `;
      this.elements.successMessage.style.display = 'block';
      
      // Auto-hide nach 4 Sekunden
      setTimeout(() => {
        if (this.elements.successMessage) {
          this.fadeOut(this.elements.successMessage);
        }
      }, 4000);
    }

    // Update Data Source
    if (this.elements.dataSource) {
      this.elements.dataSource.innerHTML = `
        ✓ Daten von WeGlide API 
        <span class="data-timestamp">(${new Date().toLocaleTimeString('de-DE')})</span>
      `;
    }

    // Enable Refresh Button
    if (this.elements.refreshButton) {
      this.elements.refreshButton.disabled = false;
    }

    // Entferne Skeleton
    if (this.elements.flightsContainer) {
      const skeleton = this.elements.flightsContainer.querySelector('.skeleton-container');
      if (skeleton) {
        skeleton.remove();
      }
    }
  }

  /**
   * Fehlerbehandlung
   */
  error(errorMessage, details = null) {
    this.currentPhase = this.phases.ERROR;
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);

    console.error('❌ Ladefehler:', errorMessage);
    if (details) console.error('Details:', details);

    // Verstecke Loading
    if (this.elements.loadingMessage) {
      this.elements.loadingMessage.style.display = 'none';
    }

    // Zeige Error Message
    if (this.elements.errorMessage) {
      this.elements.errorMessage.innerHTML = `
        <div class="error-content">
          <strong>❌ Fehler beim Laden der Daten</strong>
          <div class="error-details">${errorMessage}</div>
          ${details ? `<div class="error-technical">${details}</div>` : ''}
          <button class="retry-button" onclick="window.sgApp?.refreshData()">
            🔄 Erneut versuchen
          </button>
        </div>
      `;
      this.elements.errorMessage.style.display = 'block';
    }

    // Enable Refresh Button
    if (this.elements.refreshButton) {
      this.elements.refreshButton.disabled = false;
    }

    // Zeige Fehler-State in Container
    if (this.elements.flightsContainer) {
      this.elements.flightsContainer.innerHTML = `
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Daten konnten nicht geladen werden</h3>
          <p>${errorMessage}</p>
          <button class="retry-button-large" onclick="window.sgApp?.refreshData()">
            🔄 Erneut versuchen
          </button>
        </div>
      `;
    }
  }

  /**
   * Versteckt alle Nachrichten
   */
  hideAllMessages() {
    [
      this.elements.loadingMessage,
      this.elements.errorMessage,
      this.elements.successMessage
    ].forEach(el => {
      if (el) el.style.display = 'none';
    });
  }

  /**
   * Fade-Out Animation
   */
  fadeOut(element) {
    if (!element) return;
    
    element.style.transition = 'opacity 0.5s ease';
    element.style.opacity = '0';
    
    setTimeout(() => {
      element.style.display = 'none';
      element.style.opacity = '1';
    }, 500);
  }

  /**
   * Erstellt Skeleton Loading HTML
   */
  createSkeletonHTML() {
    return `
      <div class="skeleton-container">
        <div class="skeleton-header">
          <div class="skeleton-title"></div>
          <div class="skeleton-subtitle"></div>
        </div>
        ${this.createSkeletonCard()}
        ${this.createSkeletonCard()}
        ${this.createSkeletonCard()}
      </div>
    `;
  }

  /**
   * Erstellt eine Skeleton Flight Card
   */
  createSkeletonCard() {
    return `
      <div class="skeleton-flight-card">
        <div class="skeleton-map"></div>
        <div class="skeleton-details">
          <div class="skeleton-line skeleton-line-long"></div>
          <div class="skeleton-line skeleton-line-medium"></div>
          <div class="skeleton-line skeleton-line-short"></div>
        </div>
      </div>
    `;
  }

  /**
   * Helper: Season String
   */
  getSeasonString(seasonYear) {
    const year = parseInt(seasonYear);
    return `${year - 1}/${seasonYear}`;
  }

  /**
   * Gibt aktuellen Status zurück
   */
  getStatus() {
    return {
      phase: this.currentPhase,
      duration: this.startTime ? (Date.now() - this.startTime) : 0,
      progress: this.progressData
    };
  }
}

// Singleton Instance
let loadingManagerInstance = null;

export function getLoadingManager() {
  if (!loadingManagerInstance) {
    loadingManagerInstance = new LoadingManager();
  }
  return loadingManagerInstance;
}

export default LoadingManager;