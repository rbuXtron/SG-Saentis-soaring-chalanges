/**
 * SG Säntis Cup - Ranglisten-Komponente
 * Version 4.0 - Cup als Podium + Karten-Liste (Layout aus dem Prototyp),
 *   aufklappbare Flugdetails; themefähig über CSS-Tokens (Gold/Türkis).
 *   Benötigt cup-layout.css.
 * Version 3.2 - Flugzeugfaktor (F-Faktor) aus der Detail-Anzeige entfernt
 *   (Berechnung unveraendert: km x P-Faktor x Flugzeugfaktor x Platzfaktor)
 *   Detailspalten: Datum | Flugzeug | km | P-Faktor | Startplatz (Platzfaktor) | Punkte
 * Version 3.1 - mit Ranking-Deltas (Pfeile) + Aufsteiger der Woche
 */

import { formatNumber, formatDateForDisplay } from '../utils/utils.js';
import * as RankingDeltas from './ranking-deltas.js';

// Hilfsfunktion für Saison-Information
function getSeasonInfo(pilots) {
  const season = pilots[0]?.season || getCurrentSeasonYear();
  const seasonYear = typeof season === 'string' ? parseInt(season) : season;

  return {
    year: seasonYear,
    string: `${seasonYear - 1}/${seasonYear}`
  };
}

function getCurrentSeasonYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return month >= 10 ? year + 1 : year;
}

/**
 * Rendert die Rangliste mit Punkteanzeige
 */
export function renderRankingTable(pilots, containerId = 'rangliste') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  const seasonInfo = getSeasonInfo(pilots);

  if (!Array.isArray(pilots) || pilots.length === 0) {
    container.innerHTML = '<div class="no-data">Keine Daten verfügbar</div>';
    return;
  }

  const sortedPilots = [...pilots].sort((a, b) =>
    ((b.totalPoints || 0) - (a.totalPoints || 0)) ||
    ((a.userId || 0) - (b.userId || 0))
  );

  // Ranking-Deltas nur für die aktuelle Saison (sonst keine passenden Snapshots)
  const isCurrentSeason = seasonInfo.year === getCurrentSeasonYear();
  const deltaMap = isCurrentSeason ? RankingDeltas.prepare(sortedPilots) : new Map();
  const climber = isCurrentSeason ? RankingDeltas.climberOfWeek() : null;
  const climberChange = climber
    ? (climber.isNew
        ? (climber.currentRank === 1 ? 'neu an der Spitze' : `neu auf Platz ${climber.currentRank}`)
        : `+${climber.delta} Plätze`)
    : '';
  const climberHTML = climber
    ? `<div class="cup-climber">🚀 Aufsteiger der Woche: <strong>${climber.name}</strong> (${climberChange})</div>`
    : '';

  const ranked = sortedPilots.filter(p => (p.totalPoints || 0) > 0);
  const top3 = ranked.slice(0, 3);

  const podiumHTML = top3.length
    ? `<div class="cup-sectlabel">Podium</div>
       <div class="cup-podium">
         ${top3[1] ? podCard(top3[1], 'two', '2.') : '<div class="pod placeholder"></div>'}
         ${podCard(top3[0], 'one', '1.')}
         ${top3[2] ? podCard(top3[2], 'three', '3.') : '<div class="pod placeholder"></div>'}
       </div>`
    : '';

  const listHTML = ranked.map((p, i) => cupRowHTML(p, i + 1, deltaMap.get(p.name))).join('');

  container.innerHTML = `
    <div class="cup-wrap">
      <div class="cup-head">
        <h2 class="cup-title">Säntis Cup</h2>
        <div class="cup-sub">Saison ${seasonInfo.string} <span class="dot"></span> 3 beste Flüge × Faktoren</div>
        ${climberHTML}
      </div>
      ${podiumHTML}
      <div class="cup-sectlabel">Wertung · ${ranked.length} Piloten</div>
      <div class="cup-list">${listHTML || '<div class="no-data">Noch keine gewerteten Flüge in dieser Saison</div>'}</div>
    </div>
  `;

  setTimeout(() => setupCupToggles(container), 50);
  // Podium-Fotos nachladen (die Club-Liste liefert kein image -> user/<id> via Proxy)
  enrichPodiumAvatars(container, top3);
}

// Holt die WeGlide-Fotos der 3 Podiumsplätze nach (nur falls noch keins vorhanden).
// Nutzt denselben Proxy wie die App; Ergebnis wird am Piloten-Objekt gecacht.
async function enrichPodiumAvatars(container, top) {
  for (const p of (top || [])) {
    if (!p) continue;
    const uid = p.userId || p.user_id || p.id;
    if (!uid) continue;
    if (!(p.avatar || p.image)) {
      try {
        const res = await fetch(`/api/proxy?path=user/${uid}`, { cache: 'force-cache' });
        if (!res.ok) continue;
        const u = await res.json();
        if (u && u.image) p.avatar = u.image;   // am Objekt cachen
      } catch (_) { continue; }
    }
    const url = avatarUrl(p);
    if (!url) continue;
    const wrap = container.querySelector(`.cup-podium .pod[data-uid="${uid}"] .ava-wrap`);
    if (!wrap || wrap.querySelector('.ava-img')) continue;
    const img = document.createElement('img');
    img.className = 'ava-img';
    img.loading = 'lazy';
    img.alt = '';
    img.onerror = () => img.remove();
    img.src = url;
    wrap.appendChild(img);
  }
}

// ---- Podium / Karten-Liste (Layout aus dem Prototyp, themefähig über Tokens) ----
function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// WeGlide-Pilotenfoto (gleiches CDN wie Badges/Flugbilder). Fällt per onerror
// auf die Initialen zurück, wenn kein Bild existiert.
function avatarUrl(p) {
  // WeGlide liefert image als relativen Pfad, z.B. "10518/profile/<hash>.jpg".
  // Voll-URL = CDN-Basis + Pfad. Ohne image -> null (dann Initialen-Fallback).
  const a = p.avatar || p.image;
  if (!a) return null;
  if (/^https?:\/\//.test(a)) return a;
  return 'https://weglidefiles.b-cdn.net/' + String(a).replace(/^\/+/, '');
}

function podCard(p, cls, medal) {
  // Farbe pro Platz kommt aus dem CSS (.pod.one/.two/.three -> --pc), currentColor erbt sie.
  const nameBreak = (p.name || '').replace(/ (?=[^ ]+$)/, '<br>');
  const pts = formatNumber(Math.round(p.totalPoints || 0));
  const url = avatarUrl(p);
  const img = url
    ? `<img class="ava-img" src="${url}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '';
  const uid = p.userId || p.user_id || p.id || '';
  return `
    <div class="pod ${cls}" data-uid="${uid}">
      <div class="medal">${medal}</div>
      <div class="ava-wrap">
        <svg class="ava" viewBox="0 0 48 48" aria-hidden="true">
          <text x="24" y="31" text-anchor="middle" font-size="18" font-weight="600" fill="currentColor">${initialsOf(p.name)}</text>
        </svg>
        ${img}
      </div>
      <div class="pn">${nameBreak}</div>
      <div class="pts tnum">${pts}</div>
      <div class="u">Punkte</div>
    </div>`;
}

function mvHTML(info) {
  if (info && info.delta > 0) return `<span class="mv up">▲<b>${info.delta}</b></span>`;
  if (info && info.delta < 0) return `<span class="mv down">▼<b>${-info.delta}</b></span>`;
  return `<span class="mv flat">–</span>`;
}

function cupDetailHTML(p) {
  const flights = [...(p.flights || [])].sort((a, b) =>
    new Date(b.date || 0) - new Date(a.date || 0)
  );
  const rows = flights.map(f => {
    const fid = f.rawData?.id;
    const dateStr = formatDateForDisplay(f.date);
    const dateCell = fid
      ? `<a href="https://www.weglide.org/flight/${fid}" target="_blank" rel="noopener">${dateStr}</a>`
      : dateStr;
    return `<tr>
        <td class="lft">${dateCell}</td>
        <td class="lft">${f.aircraftType || '-'}</td>
        <td class="tnum">${(f.km || 0).toFixed(1)}</td>
        <td class="tnum">${f.pilotFactor != null ? f.pilotFactor.toFixed(1) : '-'}</td>
        <td class="lft">${f.takeoffAirportName || '-'} <span class="taf">(${f.takeoffFactor != null ? f.takeoffFactor : 0.8})</span></td>
        <td class="tnum"><strong>${(f.points || 0).toFixed(2)}</strong></td>
      </tr>`;
  }).join('') || '<tr><td colspan="6">Keine Flugdaten verfügbar</td></tr>';

  return `
    <div class="grp">Beste ${flights.length || 3} Flüge</div>
    <div class="ftwrap">
      <table class="ftable">
        <thead><tr>
          <th class="lft">Datum</th><th class="lft">Flugzeug</th><th>km</th>
          <th title="Pilotenfaktor">P-Fkt</th><th class="lft">Startplatz</th><th>Punkte</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="cupsum">Pilotenfaktor <b class="tnum">${(p.pilotFactor != null ? p.pilotFactor : 0).toFixed(1)}</b>
      <span class="dot"></span>Gesamtpunkte <b class="tnum">${formatNumber((p.totalPoints || 0).toFixed(2))}</b></div>`;
}

function cupRowHTML(p, rank, deltaInfo) {
  const source = (p.allFlights && p.allFlights.length) ? p.allFlights : (p.flights || []);
  const flightCount = source.length;
  const totalKm = source.reduce((s, f) => s + (f.km || 0), 0);
  const pts = formatNumber(Math.round(p.totalPoints || 0));
  const topCls = rank <= 3 ? ` top${rank}` : '';
  return `
    <div class="rowcard${topCls}" aria-expanded="false">
      <button class="prow" type="button" aria-label="${p.name} – Details">
        <span class="rk tnum">${rank}</span>
        ${mvHTML(deltaInfo)}
        <span class="who">
          <span class="nm">${p.name}</span>
          <span class="cats"><span>${flightCount} Flüge · ${formatNumber(Math.round(totalKm))} km</span></span>
        </span>
        <span class="score">
          <b class="tnum">${pts}</b><span>Pkt</span>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </button>
      <div class="detail">${cupDetailHTML(p)}</div>
    </div>`;
}

function setupCupToggles(container) {
  container.querySelectorAll('.cup-list .prow').forEach(btn => {
    if (btn.hasAttribute('data-cup-bound')) return;
    btn.setAttribute('data-cup-bound', 'true');
    btn.addEventListener('click', () => {
      const card = btn.closest('.rowcard');
      const open = card.getAttribute('aria-expanded') === 'true';
      card.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  });
}

function createRankingTable(pilots, deltaMap = new Map()) {
  const tableContainer = document.createElement('div');
  tableContainer.className = 'badge-ranking-table-container';

  const table = document.createElement('table');
  table.className = 'badge-ranking-table';

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
    <tbody></tbody>
`;

  const tbody = table.querySelector('tbody');

  pilots.forEach((pilot, index) => {
    if (!pilot?.name) return;

    const rank = index + 1;
    const row = createRankingRow(pilot, rank, deltaMap);
    tbody.appendChild(row);

    const detailsRow = createDetailsRow(pilot);
    tbody.appendChild(detailsRow);
  });

  tableContainer.appendChild(table);
  return tableContainer;
}

function createRankingRow(pilot, rank, deltaMap = new Map()) {
  const row = document.createElement('tr');

  if (rank === 1) row.classList.add('first-place');
  else if (rank === 2) row.classList.add('second-place');
  else if (rank === 3) row.classList.add('third-place');

  const safeId = pilot.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const totalKm = (pilot.flights || []).reduce((sum, f) => sum + (f.km || 0), 0);
  const deltaBadge = RankingDeltas.badgeHTML(deltaMap.get(pilot.name));

  row.innerHTML = `
        <td class="rank-col">
            <span class="rank rank-${rank}">${rank}</span>
            ${deltaBadge}
        </td>
        <td class="pilot-col">
            <span class="pilot-name">${pilot.name}</span>
        </td>
        <td class="flights-col">
            <span class="flights-count">${pilot.flights?.length || 0}</span>
        </td>
        <td class="km-col">
            <span class="km-value">${formatNumber(totalKm.toFixed(1))} km</span>
        </td>
        <td class="points-col">
            <span class="points-value">${formatNumber(pilot.totalPoints.toFixed(2))}</span>
        </td>
        <td class="details-col">
            <button class="toggle-details" 
                    data-pilot="${pilot.name}" 
                    data-safe-id="${safeId}"
                    aria-expanded="false">
                Details
            </button>
        </td>
    `;

  return row;
}

function createDetailsRow(pilot) {
  const safeId = pilot.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

  const detailsRow = document.createElement('tr');
  detailsRow.className = 'flight-details-row';
  detailsRow.style.display = 'none';
  detailsRow.setAttribute('data-details-for', safeId);

  const detailsCell = document.createElement('td');
  detailsCell.colSpan = 6;

  let detailsHTML = `
        <div class="flight-details">
            <h4>Flugdetails für ${pilot.name}</h4>
            <table class="details-table">
                <thead>
                    <tr>
                        <th>Datum</th>
                        <th>Flugzeug</th>
                        <th>km</th>
                        <th>P-Faktor</th>
                        <th>Startplatz</th>
                        <th>Punkte</th>
                    </tr>
                </thead>
                <tbody>
    `;

  if (pilot.flights?.length > 0) {
    const sortedFlights = [...pilot.flights].sort((a, b) =>
      new Date(b.date || 0) - new Date(a.date || 0)
    );

    sortedFlights.forEach(flight => {
      const flightId = flight.rawData?.id;
      const dateStr = formatDateForDisplay(flight.date);
      const dateCell = flightId
        ? `<a href="https://www.weglide.org/flight/${flightId}" target="_blank">${dateStr}</a>`
        : dateStr;

      detailsHTML += `
                <tr>
                    <td>${dateCell}</td>
                    <td>${flight.aircraftType || '-'}</td>
                    <td>${flight.km.toFixed(1)}</td>
                    <td>${flight.pilotFactor?.toFixed(1) || '-'}</td>
                    <td>${flight.takeoffAirportName || '-'} (${flight.takeoffFactor || 0.8})</td>
                    <td><strong>${flight.points.toFixed(2)}</strong></td>
                </tr>
            `;
    });
  } else {
    detailsHTML += '<tr><td colspan="6">Keine Flugdaten verfügbar</td></tr>';
  }

  detailsHTML += `
                </tbody>
            </table>
            <div class="details-summary">
                <p><strong>Gesamtpunkte:</strong> ${formatNumber(pilot.totalPoints.toFixed(2))}</p>
                <p><strong>Pilotenfaktor:</strong> ${pilot.pilotFactor || 'N/A'}</p>
            </div>
        </div>
    `;

  detailsCell.innerHTML = detailsHTML;
  detailsRow.appendChild(detailsCell);
  return detailsRow;
}

function addDetailsEventListeners() {
  document.querySelectorAll('.toggle-details').forEach(button => {
    if (button.hasAttribute('data-listener-added')) return;
    button.setAttribute('data-listener-added', 'true');

    button.addEventListener('click', function (e) {
      e.preventDefault();

      const safeId = this.getAttribute('data-safe-id');
      const detailsRow = document.querySelector(`[data-details-for="${safeId}"]`);

      if (!detailsRow) return;

      const isVisible = detailsRow.style.display === 'table-row';

      // Alle anderen schließen
      document.querySelectorAll('.flight-details-row').forEach(row => {
        row.style.display = 'none';
      });
      document.querySelectorAll('.toggle-details').forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
      });

      // Diese togglen
      if (!isVisible) {
        detailsRow.style.display = 'table-row';
        this.setAttribute('aria-expanded', 'true');

        setTimeout(() => {
          detailsRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    });
  });
}

/**
 * Rendert die neuesten Club-Flüge (Vollständige Version mit Bildergalerie)
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

  // Prüfe ob überhaupt Piloten vorhanden sind
  if (!pilots || pilots.length === 0) {
    container.innerHTML = '<div class="no-data">Keine Piloten in dieser Saison vorhanden</div>';
    return;
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

    // Zusätzliche Bilder aus Story
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

    // Overlay für "Zum Flug"
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
    infoContainer.style.backgroundColor = 'var(--background-card)';
    infoContainer.style.color = 'var(--text-primary)';

    // Linke Spalte
    const leftInfo = document.createElement('div');
    leftInfo.className = 'left-info';

    const punktePilot = document.createElement('div');
    punktePilot.style.fontSize = '18px';
    punktePilot.style.fontWeight = 'bold';
    punktePilot.style.marginBottom = '5px';

    const punkte = flight.originalPoints ? flight.originalPoints.toFixed(0) : '0';
    punktePilot.innerHTML = `${punkte} · <a href="${flightUrl}" target="_blank" style="color: var(--accent-teal); text-decoration: none;">${flight.pilotName}</a>`;

    const ort = document.createElement('div');
    ort.style.color = 'var(--text-secondary)';
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
    distanz.innerHTML = `<span style="color: var(--text-secondary);">↔</span> ${flight.km.toFixed(0)} km`;

    const geschwindigkeit = document.createElement('div');
    const speed = flight.speed ? flight.speed.toFixed(0) : '0';
    geschwindigkeit.innerHTML = `<span style="color: var(--text-secondary);">⏱</span> ${speed} km/h`;

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
