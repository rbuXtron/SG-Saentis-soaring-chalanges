/**
 * SG Säntis Cup - Ranglisten-Komponente (VOLLSTÄNDIG ÜBERARBEITET)
 * 
 * Version 2.0 mit verbesserter Details-Funktionalität
 */

import { formatNumber, formatDateForDisplay, showNotification } from '../utils/utils.js';

/**
 * Rendert die Rangliste mit Punkteanzeige
 * @param {Array} pilots - Array mit Pilotendaten
 * @param {string} containerId - ID des Container-Elements
 */
export function renderRankingTable(pilots, containerId = 'rangliste') {
  const container = document.getElementById(containerId);
  if (!container) return;

  console.log('🔧 Rendering ranking table...');

  // Container leeren
  container.innerHTML = '';

  if (!Array.isArray(pilots) || pilots.length === 0) {
    container.innerHTML = '<div class="no-data">Keine Daten verfügbar</div>';
    return;
  }

  // Sortierung nach Punkten (höchste zuerst)
  const sortedPilots = [...pilots].sort((a, b) => {
    const pointsA = Number(a.totalPoints) || 0;
    const pointsB = Number(b.totalPoints) || 0;
    return pointsB - pointsA;
  });

  // Überschrift
  const header = document.createElement('div');
  header.className = 'ranking-header';
  header.innerHTML = `
    <h2 class="section-title">🏆 SG Säntis Cup Rangliste 2025</h2>
    <div class="ranking-subtitle">
      Basierend auf den drei besten Flügen jedes Piloten mit angepassten Faktoren für faire Wettbewerbsbedingungen
    </div>
  `;
  container.appendChild(header);

  // Tabellen-Container
  const tableContainer = document.createElement('div');
  tableContainer.className = 'badge-ranking-table-container';

  // Tabelle erstellen
  const table = document.createElement('table');
  table.className = 'badge-ranking-table';

  // Tabellen-Header mit Icons
  table.innerHTML = `
    <thead>
      <tr>
        <th class="rank-col">
          <span class="table-header-icon table-header-svg-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </span>
          Rang
        </th>
        <th class="pilot-col">
          <span class="table-header-icon table-header-svg-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </span>
          Pilot
        </th>
        <th class="flights-col">
          <span class="table-header-icon table-header-svg-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
            </svg>
          </span>
          gewertete Flüge
        </th>
        <th class="km-col">
          <span class="table-header-icon table-header-svg-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 0l-4 4 4 4 4-4-4-4zm8 0l-4 4 4 4V8z"/>
            </svg>
          </span>
          Gesamt Kilometer
        </th>
        <th class="points-col">
          <span class="table-header-icon table-header-svg-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
          Gesamt Punkte
        </th>
        <th class="details-col">
          <span class="table-header-icon table-header-svg-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
            </svg>
          </span>
          Details
        </th>
      </tr>
    </thead>
    <tbody id="ranking-body"></tbody>
  `;

  tableContainer.appendChild(table);
  container.appendChild(tableContainer);

  const tbody = table.querySelector('tbody');

  // Zeilen erstellen
  sortedPilots.forEach((pilot, index) => {
    if (!pilot || !pilot.name) return;

    const rank = index + 1;
    const row = document.createElement('tr');

    // Spezielle Klassen für Top 3
    if (rank === 1) row.classList.add('first-place');
    else if (rank === 2) row.classList.add('second-place');
    else if (rank === 3) row.classList.add('third-place');

    const safeId = pilot.name
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

    // Berechne Gesamtkilometer
    let totalKm = 0;
    if (Array.isArray(pilot.flights)) {
      pilot.flights.forEach(flight => {
        totalKm += flight.km || 0;
      });
    }

    row.innerHTML = `
      <td class="rank-col">
        <div class="rank-container">
          <span class="rank rank-${rank}">${rank}</span>
        </div>
      </td>
      <td class="pilot-col">
        <div class="pilot-info">
          <span class="pilot-name">${pilot.name}</span>
          ${rank <= 3 ? '<span class="pilot-badge"></span>' : ''}
        </div>
      </td>
      <td class="flights-col">
        <div class="flights-display">
          <span class="flights-count">${Array.isArray(pilot.flights) ? pilot.flights.length : 0}</span>
        </div>
      </td>
      <td class="km-col">
        <div class="km-display">
          <span class="km-value">${formatNumber(totalKm.toFixed(1))} km</span>
        </div>
      </td>
      <td class="points-col">
        <div class="points-display">
          <span class="points-value">${formatNumber(pilot.totalPoints.toFixed(2))}</span>
        </div>
      </td>
      <td class="details-col">
        <button class="toggle-details modern-button" 
                data-pilot="${pilot.name}" 
                data-safe-id="${safeId}"
                aria-expanded="false">
          <svg class="details-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <span class="button-text">Details</span>
        </button>
      </td>
    `;

    tbody.appendChild(row);

    // Details-Zeile erstellen
    const detailsRow = document.createElement('tr');
    detailsRow.classList.add('flight-details-row');
    detailsRow.style.display = 'none';
    detailsRow.setAttribute('data-details-for', safeId);

    const detailsCell = document.createElement('td');
    detailsCell.colSpan = 6;
    detailsCell.style.padding = '0';

    const detailsContainer = document.createElement('div');
    detailsContainer.classList.add('flight-details');
    detailsContainer.setAttribute('id', `details-${safeId}`);

    // Details-Inhalt erstellen
    let detailsHTML = `<div class="details-header"><h4>Flugdetails für ${pilot.name}</h4></div>`;

    detailsHTML += '<table class="details-table">';
    detailsHTML += '<thead><tr>';
    detailsHTML += '<th>Datum</th><th>Flugzeug</th><th>Km</th><th>P-Faktor</th><th>Flz-Faktor</th><th>Startplatz (Faktor)</th><th>Punkte</th>';
    detailsHTML += '</tr></thead><tbody>';

    if (Array.isArray(pilot.flights) && pilot.flights.length > 0) {
      const sortedFlights = [...pilot.flights].sort((a, b) => {
        const dateA = new Date(a.date || a.scoring_date || 0);
        const dateB = new Date(b.date || b.scoring_date || 0);
        return dateB - dateA; // Für älteste zuerst: dateA - dateB
      });

      sortedFlights.forEach((flight, flightIndex) => {
        if (!flight) return;

        const flightId = flight.rawData?.id || '';
        const dateDisplay = formatDateForDisplay(flight.date);
        const dateCell = flightId ?
          `<a href="https://www.weglide.org/flight/${flightId}" target="_blank" title="Flug auf WeGlide ansehen">${dateDisplay}</a>` :
          dateDisplay;

        const km = flight.km || 0;
        const pFactor = flight.pFactor || flight.pilotFactor || '-';
        const flzFaktor = flight.flzFaktor || flight.aircraftFactor || 0;
        const aircraftType = flight.aircraftType || flight.rawData?.aircraft?.name || '-';
        const takeoffAirport = flight.takeoffAirportName || flight.rawData?.takeoff_airport?.name || '-';
        const takeoffFactor = flight.takeoffFactor || 0.8;
        const points = flight.points || 0;

        detailsHTML += `
          <tr>
            <td>${dateCell}</td>
            <td>${aircraftType}</td>
            <td>${km.toFixed(1)} km</td>
            <td>${typeof pFactor === 'number' ? pFactor.toFixed(1) : pFactor}</td>
            <td>${typeof flzFaktor === 'number' ? flzFaktor.toFixed(3) : flzFaktor}</td>
            <td>${takeoffAirport} (${takeoffFactor})</td>
            <td><strong>${points.toFixed(2)}</strong></td>
          </tr>
        `;
      });
    } else {
      detailsHTML += '<tr><td colspan="7" style="text-align: center; color: #666;">Keine Flugdaten verfügbar</td></tr>';
    }

    detailsHTML += '</tbody></table>';

    detailsHTML += `
      <div class="details-summary">
        <p><strong>Gesamtpunkte:</strong> ${formatNumber(pilot.totalPoints.toFixed(2))}</p>
        <p><strong>Pilotenfaktor:</strong> ${pilot.pilotFactor || 'N/A'}</p>
        <p><strong>Anzahl gewertete Flüge:</strong> ${Array.isArray(pilot.flights) ? pilot.flights.length : 0}</p>
      </div>
    `;

    detailsContainer.innerHTML = detailsHTML;
    detailsCell.appendChild(detailsContainer);
    detailsRow.appendChild(detailsCell);
    tbody.appendChild(detailsRow);
  });

  // Footer hinzufügen
  const footer = document.createElement('div');
  footer.className = 'ranking-footer';
  footer.innerHTML = `
    <div class="ranking-info">
      <div class="ranking-status">
        <span class="status-icon" aria-hidden="true">📅</span>
        <strong>Stand:</strong> <span id="ranking-date">${formatDateForDisplay(new Date())}</span>
      </div>
      <div class="ranking-description">
        <span class="description-icon" aria-hidden="true">ℹ️</span>
        Die SG Säntis Cup Rangliste wird basierend auf den drei besten Flügen jedes Piloten berechnet.
      </div>
    </div>
  `;
  container.appendChild(footer);

  // Event Listener hinzufügen
  setTimeout(() => {
    addDetailsEventListeners();
  }, 100);

  console.log('🔧 Ranking table rendering complete');
}

/**
 * Event Listener für Details-Buttons
 */
function addDetailsEventListeners() {
  const buttons = document.querySelectorAll('.toggle-details');
  console.log(`🔧 Found ${buttons.length} detail buttons`);

  buttons.forEach((button, index) => {
    // Verhindere doppelte Event Listener
    if (button.hasAttribute('data-listener-added')) {
      return;
    }
    button.setAttribute('data-listener-added', 'true');

    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();

      const pilotName = this.getAttribute('data-pilot');
      const safeId = this.getAttribute('data-safe-id');

      console.log(`🔧 Details clicked for: ${pilotName} (safeId: ${safeId})`);

      // Finde die Details-Zeile
      let detailsRow = null;

      // Methode 1: Nächste Zeile
      const currentRow = this.closest('tr');
      if (currentRow) {
        detailsRow = currentRow.nextElementSibling;
        console.log('Methode 1 - Nächste Zeile gefunden:', !!detailsRow);
      }

      // Methode 2: Über data-attribute
      if (!detailsRow || !detailsRow.classList.contains('flight-details-row')) {
        detailsRow = document.querySelector(`tr[data-details-for="${safeId}"]`);
        console.log('Methode 2 - Über data-attribute gefunden:', !!detailsRow);
      }

      // Methode 3: Über ID des Details-Containers
      if (!detailsRow) {
        const detailsContainer = document.getElementById(`details-${safeId}`);
        if (detailsContainer) {
          detailsRow = detailsContainer.closest('tr');
          console.log('Methode 3 - Über Container-ID gefunden:', !!detailsRow);
        }
      }

      if (detailsRow && detailsRow.classList.contains('flight-details-row')) {
        // Toggle visibility
        const isCurrentlyVisible = detailsRow.style.display === 'table-row' ||
          detailsRow.style.display === '';

        if (isCurrentlyVisible && detailsRow.style.display !== 'none') {
          // Verstecken
          detailsRow.style.display = 'none';
          this.setAttribute('aria-expanded', 'false');

          // Icon zurücksetzen
          const svg = this.querySelector('svg');
          if (svg) {
            svg.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
          }
        } else {
          // Alle anderen Details schließen
          document.querySelectorAll('.flight-details-row').forEach(row => {
            row.style.display = 'none';
          });
          document.querySelectorAll('.toggle-details').forEach(btn => {
            btn.setAttribute('aria-expanded', 'false');
            const svg = btn.querySelector('svg');
            if (svg) {
              svg.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
            }
          });

          // Diese Details anzeigen
          detailsRow.style.display = 'table-row';
          detailsRow.style.visibility = 'visible';
          detailsRow.style.opacity = '1';
          this.setAttribute('aria-expanded', 'true');

          // Icon ändern
          const svg = this.querySelector('svg');
          if (svg) {
            svg.innerHTML = '<polyline points="18 15 12 9 6 15"></polyline>';
          }

          // Debug
          console.log('Details row display:', detailsRow.style.display);
          console.log('Details container:', detailsRow.querySelector('.flight-details'));

          // Scroll to details
          setTimeout(() => {
            detailsRow.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest'
            });
          }, 100);
        }
      } else {
        console.error(`🐛 Details row not found for: ${pilotName} (${safeId})`);
        console.log('🐛 Debugging Info:');
        console.log('  - Current Row:', this.closest('tr'));
        console.log('  - All detail rows:', document.querySelectorAll('.flight-details-row').length);
        console.log('  - Looking for data-details-for:', safeId);
      }
    });
  });

  console.log(`🔧 Event listeners added successfully`);
}

/**
 * Rendert die neuesten Club-Flüge
 */
export function renderLatestClubFlights(pilots, limit = 10, offset = 0, containerId = 'latest-flights-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Bei offset=0 (erste Seite) Container leeren
  if (offset === 0) {
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '40px';
  } else {
    // Entferne nur den "Mehr laden" Button
    const existingButton = container.querySelector('.load-more-button');
    if (existingButton) {
      existingButton.remove();
    }
  }

  // Alle Flüge sammeln
  let alleFlüge = [];
  if (Array.isArray(pilots)) {
    pilots.forEach(pilot => {
      if (!pilot || !Array.isArray(pilot.allFlights)) return;

      pilot.allFlights.forEach(flight => {
        if (!flight || !flight.rawData || !flight.rawData.id) return;

        alleFlüge.push({
          pilotName: pilot.name,
          ...flight
        });
      });
    });
  }

  // Nach Datum sortieren (neueste zuerst)
  alleFlüge.sort((a, b) => {
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    return dateB - dateA;
  });

  // Flüge für den aktuellen Bereich auswählen
  const totalFlights = alleFlüge.length;
  const latestFlights = alleFlüge.slice(offset, offset + limit);

  if (latestFlights.length === 0) {
    if (offset === 0) {
      const noData = document.createElement('div');
      noData.className = 'no-data';
      noData.textContent = 'Keine aktuellen Flüge verfügbar.';
      container.appendChild(noData);
    }
    return;
  }

  // Aktuelle Monatsanzeige
  let currentMonth = '';

  // Fragment für effizientes Rendering
  const fragment = document.createDocumentFragment();

  // Flüge anzeigen
  latestFlights.forEach(flight => {
    const flightDate = new Date(flight.date || '');
    if (isNaN(flightDate.getTime())) return;

    const month = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(flightDate);

    // Neuen Monatsheader anzeigen
    if (month !== currentMonth) {
      currentMonth = month;
      const monthHeader = document.createElement('h3');
      monthHeader.className = 'month-header';
      monthHeader.textContent = month;
      monthHeader.style.textAlign = 'center';
      monthHeader.style.margin = '30px 0 20px';
      monthHeader.style.color = '#888';
      monthHeader.style.fontWeight = 'normal';
      fragment.appendChild(monthHeader);
    }

    // Flug-Container erstellen
    const flightCard = document.createElement('div');
    flightCard.className = 'flight-detail-card';
    flightCard.style.marginBottom = '40px';
    flightCard.style.borderRadius = '10px';
    flightCard.style.overflow = 'hidden';
    flightCard.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    flightCard.style.transition = 'transform 0.2s, box-shadow 0.3s ease';
    flightCard.style.width = '100%';
    flightCard.style.maxWidth = '100%';

    // Flug-ID für Bildquellen und Links
    const flightId = flight.rawData.id;
    const flightUrl = `https://www.weglide.org/flight/${flightId}`;

    // Hover-Effekt
    flightCard.addEventListener('mouseenter', function () {
      this.style.transform = 'translateY(-5px)';
      this.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
    });

    flightCard.addEventListener('mouseleave', function () {
      this.style.transform = '';
      this.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    });

    // Bildergalerie
    const gallery = document.createElement('div');
    gallery.className = 'flight-gallery';
    gallery.style.position = 'relative';
    gallery.style.display = 'flex';
    gallery.style.height = '400px';
    gallery.style.overflow = 'hidden';
    gallery.style.transition = 'all 0.3s ease';
    gallery.style.cursor = 'pointer';

    // Klick-Event für die Galerie
    gallery.addEventListener('click', function () {
      window.open(flightUrl, '_blank');
    });

    // Hover-Effekt für die Galerie
    gallery.addEventListener('mouseenter', function () {
      this.style.filter = 'brightness(1.05)';
      const overlay = this.querySelector('.gallery-overlay');
      if (overlay) overlay.style.opacity = '1';
    });

    gallery.addEventListener('mouseleave', function () {
      this.style.filter = '';
      const overlay = this.querySelector('.gallery-overlay');
      if (overlay) overlay.style.opacity = '0';
    });

    // Hauptbild
    const mainImage = document.createElement('div');
    mainImage.style.flex = '1';
    mainImage.style.backgroundImage = `url(https://weglidefiles.b-cdn.net/flight/${flightId}.jpg)`;
    mainImage.style.backgroundSize = 'cover';
    mainImage.style.backgroundPosition = 'center';
    mainImage.style.backgroundRepeat = 'no-repeat';

    // Zusätzliche Bilder
    if (flight.rawData.story && flight.rawData.story.length > 0) {
      for (let i = 0; i < Math.min(2, flight.rawData.story.length); i++) {
        const storyImage = document.createElement('div');
        storyImage.style.flex = '1';
        storyImage.style.backgroundImage = `url(https://weglidefiles.b-cdn.net/${flight.rawData.story[i]})`;
        storyImage.style.backgroundSize = 'cover';
        storyImage.style.backgroundPosition = 'center';
        gallery.appendChild(storyImage);
      }
    } else {
      mainImage.style.flex = '3';
    }

    gallery.appendChild(mainImage);

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'gallery-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';

    const overlayText = document.createElement('span');
    overlayText.className = 'overlay-text';
    overlayText.textContent = 'Zum Flug';
    overlayText.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    overlayText.style.color = 'white';
    overlayText.style.padding = '8px 16px';
    overlayText.style.borderRadius = '20px';
    overlayText.style.fontSize = '14px';
    overlayText.style.fontWeight = '500';
    overlayText.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.3)';

    overlay.appendChild(overlayText);
    gallery.appendChild(overlay);
    flightCard.appendChild(gallery);

    // Flug-Informationen
    const infoContainer = document.createElement('div');
    infoContainer.className = 'flight-info';
    infoContainer.style.padding = '15px';
    infoContainer.style.display = 'flex';
    infoContainer.style.justifyContent = 'space-between';
    infoContainer.style.backgroundColor = '#fff';

    // Linke Spalte
    const leftInfo = document.createElement('div');
    leftInfo.className = 'left-info';

    const punktePilot = document.createElement('div');
    punktePilot.style.fontSize = '18px';
    punktePilot.style.fontWeight = 'bold';
    punktePilot.style.marginBottom = '5px';

    const punkte = flight.originalPoints ? flight.originalPoints.toFixed(0) : '0';
    punktePilot.innerHTML = `${punkte} · <a href="${flightUrl}" target="_blank" style="color: #3498db; text-decoration: none;">${flight.pilotName}</a>`;

    const ort = document.createElement('div');
    ort.style.color = '#666';
    ort.style.fontSize = '14px';
    const ortName = flight.takeoffAirportName || 'Unbekannt';
    ort.textContent = ortName;

    leftInfo.appendChild(punktePilot);
    leftInfo.appendChild(ort);

    // Mittlere Spalte
    const middleInfo = document.createElement('div');
    middleInfo.className = 'middle-info';
    middleInfo.style.textAlign = 'center';

    const distanz = document.createElement('div');
    distanz.style.marginBottom = '10px';
    distanz.innerHTML = `<span style="color: #666;">&#10230;</span> ${flight.km.toFixed(0)} km`;

    const geschwindigkeit = document.createElement('div');
    const speed = flight.speed ? flight.speed.toFixed(0) : '0';
    geschwindigkeit.innerHTML = `<span style="color: #666;">&#128336;</span> ${speed} km/h`;

    middleInfo.appendChild(distanz);
    middleInfo.appendChild(geschwindigkeit);

    // Rechte Spalte
    const rightInfo = document.createElement('div');
    rightInfo.className = 'right-info';
    rightInfo.style.textAlign = 'right';

    const datumElement = document.createElement('div');
    const formattedDate = new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(flightDate);
    datumElement.textContent = formattedDate;

    const flugzeugElement = document.createElement('div');
    flugzeugElement.style.marginTop = '10px';
    flugzeugElement.textContent = flight.aircraftType || 'Unbekannt';

    rightInfo.appendChild(datumElement);
    rightInfo.appendChild(flugzeugElement);

    // Alles zusammenfügen
    infoContainer.appendChild(leftInfo);
    infoContainer.appendChild(middleInfo);
    infoContainer.appendChild(rightInfo);

    flightCard.appendChild(infoContainer);
    fragment.appendChild(flightCard);
  });

  // "Mehr laden" Button
  const nextOffset = offset + limit;
  if (nextOffset < totalFlights) {
    const loadMoreButton = document.createElement('button');
    loadMoreButton.className = 'load-more-button';
    loadMoreButton.textContent = 'Mehr laden';
    loadMoreButton.style.display = 'block';
    loadMoreButton.style.margin = '20px auto 40px';
    loadMoreButton.style.padding = '10px 25px';
    loadMoreButton.style.backgroundColor = '#4a7dff';
    loadMoreButton.style.color = '#fff';
    loadMoreButton.style.border = 'none';
    loadMoreButton.style.borderRadius = '50px';
    loadMoreButton.style.fontSize = '16px';
    loadMoreButton.style.cursor = 'pointer';
    loadMoreButton.style.transition = 'background-color 0.2s';

    loadMoreButton.addEventListener('mouseenter', function () {
      this.style.backgroundColor = '#3a6ae0';
    });

    loadMoreButton.addEventListener('mouseleave', function () {
      this.style.backgroundColor = '#4a7dff';
    });

    loadMoreButton.addEventListener('click', function () {
      renderLatestClubFlights(pilots, 15, nextOffset, containerId);
    });

    fragment.appendChild(loadMoreButton);
  } else if (offset > 0) {
    const endMessage = document.createElement('div');
    endMessage.style.textAlign = 'center';
    endMessage.style.margin = '20px auto 40px';
    endMessage.style.color = '#777';
    endMessage.textContent = 'Alle Flüge wurden geladen';
    fragment.appendChild(endMessage);
  }

  // Alles ins DOM einfügen
  container.appendChild(fragment);
}

/**
 * DEBUG-FUNKTION für Tabellen-Struktur
 */
export function debugTableStructure() {
  const table = document.querySelector('.ranking-table');
  if (!table) {
    console.error('❌ Ranking-Tabelle nicht gefunden!');
    return;
  }

  const headers = table.querySelectorAll('thead th');
  const firstDataRow = table.querySelector('tbody tr.rank-row');

  console.log('🔍 TABELLEN-STRUKTUR DEBUG:');
  console.log(`Headers: ${headers.length} Spalten`);
  headers.forEach((h, i) => console.log(`  ${i + 1}. "${h.textContent.trim()}"`));

  if (firstDataRow) {
    console.log(`Daten-Zeile: ${firstDataRow.children.length} Spalten`);
    Array.from(firstDataRow.children).forEach((td, i) => {
      console.log(`  ${i + 1}. "${td.textContent.trim()}"`);
    });
  }

  if (headers.length !== firstDataRow?.children.length) {
    console.error(`❌ SPALTEN-MISMATCH: ${headers.length} Header vs ${firstDataRow?.children.length} Daten-Spalten`);
  } else {
    console.log('✅ Spalten-Anzahl stimmt überein');
  }
}