/**
 * SG Säntis Cup - WeGlide Badges Komponente
 * Version 4.3 - Fortschritt zum nächsten Level + Seltenheit pro Badge
 * Version 4.2 - Multi-Level-Badges: Level-Verlauf aus badge-history-latest.json
 *   (Klick auf ein Multi-Level-Badge zeigt die Stufen mit Datum + Flug-Link)
 *   + generische Saison-Bezeichnung (N-1)/N
 */

import { formatDateForDisplay } from '../utils/utils.js';
import * as RankingDeltas from './ranking-deltas.js';

// ---------------------------------------------------------------------------
// Badge-Level-Verlauf (badge-history-latest.json)
// ---------------------------------------------------------------------------
// Wird einmal geladen und gecacht. Struktur:
//   { pilots: { "<uid>": { name, badges: { "<badge_id>":
//       { level, history: [[level, "YYYY-MM-DD", flight_id|null], ...] } } } } }
let _badgeHistory = null;          // geparste Daten (oder {} wenn nicht vorhanden)
let _badgeHistoryPromise = null;   // laufender Ladevorgang (verhindert Mehrfach-Fetch)

// Seltenheit pro Badge in DIESER Saison: badge_id -> { count, total }
// count = wie viele Piloten das Badge haben, total = Piloten mit mind. 1 Badge.
let _rarityMap = new Map();

function loadBadgeHistory() {
    if (_badgeHistoryPromise) return _badgeHistoryPromise;

    const candidates = [
        './data/badge-history-latest.json',
        'data/badge-history-latest.json',
        '/data/badge-history-latest.json'
    ];

    _badgeHistoryPromise = (async () => {
        for (const url of candidates) {
            try {
                const res = await fetch(url, { cache: 'no-cache' });
                if (!res.ok) continue;
                const data = await res.json();
                _badgeHistory = (data && data.pilots) ? data : { pilots: {} };
                return _badgeHistory;
            } catch (_) { /* nächster Pfad */ }
        }
        // Datei (noch) nicht vorhanden – leer behandeln, App läuft normal weiter
        _badgeHistory = { pilots: {} };
        return _badgeHistory;
    })();

    return _badgeHistoryPromise;
}

function getBadgeLevelHistory(uid, badgeId) {
    if (!_badgeHistory || !_badgeHistory.pilots) return null;
    const p = _badgeHistory.pilots[String(uid)];
    if (!p || !p.badges) return null;
    const b = p.badges[badgeId];
    if (!b || !Array.isArray(b.history)) return null;
    return b.history;
}

// Hilfsfunktion für Saison-Information
function getSeasonInfo(pilots) {
    const season = pilots[0]?.season || getCurrentSeasonYear();
    const seasonYear = typeof season === 'string' ? parseInt(season) : season;

    return {
        year: seasonYear,
        string: `${seasonYear - 1}/${seasonYear}`,
        start: `Oktober ${seasonYear - 1}`,
        shortString: `${String(seasonYear - 1).slice(-2)}/${String(seasonYear).slice(-2)}`
    };
}

function getCurrentSeasonYear() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return month >= 10 ? year + 1 : year;
}

/**
 * Rendert die Badge-Rangliste
 */
export function renderBadgeRanking(pilots, containerId = 'badge-ranking-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Level-Verlauf im Hintergrund laden, damit er beim ersten Badge-Klick bereit ist
    loadBadgeHistory();

    container.innerHTML = '';
    const seasonInfo = getSeasonInfo(pilots);

    if (!Array.isArray(pilots) || pilots.length === 0) {
        container.innerHTML = '<div class="no-data">Keine Badge-Daten verfügbar</div>';
        return;
    }

    const pilotsWithBadges = pilots
        .filter(pilot => pilot.badgeCount > 0)
        .sort((a, b) =>
            (b.badgeCount - a.badgeCount) ||                              // 1. Badges Saison
            ((b.allTimeBadgeCount || 0) - (a.allTimeBadgeCount || 0)) ||  // 2. Badges Gesamt
            ((a.userId || 0) - (b.userId || 0))                          // 3. stabil bei Gleichstand
        );

    // Seltenheit berechnen: pro Badge-Kategorie, wie viele Piloten es diese Saison haben.
    _rarityMap = new Map();
    const totalWithBadges = pilotsWithBadges.length;
    pilotsWithBadges.forEach(p => {
        const seen = new Set();
        (Array.isArray(p.badges) ? p.badges : (p.seasonBadges || [])).forEach(b => {
            if (!b.badge_id || seen.has(b.badge_id)) return;
            seen.add(b.badge_id);
            const cur = _rarityMap.get(b.badge_id) || { count: 0, total: totalWithBadges };
            cur.count += 1;
            cur.total = totalWithBadges;
            _rarityMap.set(b.badge_id, cur);
        });
    });

    // Ranking-Deltas für das Badge-Ranking (eigener Namespace 'badges').
    // Nur für die aktuelle Saison — für alte Saisons gibt es keine Snapshots.
    const isCurrentSeason = seasonInfo.year === getCurrentSeasonYear();
    const deltaMap = isCurrentSeason ? RankingDeltas.prepare(pilotsWithBadges, 'badges') : new Map();
    const climber = isCurrentSeason ? RankingDeltas.climberOfWeek('badges') : null;
    const climberChange = climber
        ? (climber.isNew
            ? (climber.currentRank === 1 ? 'neu an der Spitze' : `neu auf Platz ${climber.currentRank}`)
            : `+${climber.delta} Plätze`)
        : '';
    const climberHTML = climber
        ? `<div class="climber-of-week">🚀 Aufsteiger der Woche: <strong>${climber.name}</strong> (${climberChange})</div>`
        : '';

    if (pilotsWithBadges.length === 0) {
        renderNoBadgesMessage(container, pilots, seasonInfo);
        return;
    }

    // Header
    const header = document.createElement('div');
    header.className = 'ranking-header';
    header.innerHTML = `
        <img src="./images/weglide-badge-logo.png" alt="WeGlide Badge Award"
             class="section-logo" style="width: 82px; height: 87px; margin-bottom: var(--spacing-md);
             display: block; margin-left: auto; margin-right: auto;">
        <h2 class="section-title">WeGlide Badge Award Saison ${seasonInfo.string}</h2>
        <div class="ranking-subtitle">Gesammelte Abzeichen seit ${seasonInfo.start}</div>
        ${climberHTML}
    `;
    container.appendChild(header);

    // Tabelle
    const table = createBadgeTable(pilotsWithBadges, seasonInfo, deltaMap);
    container.appendChild(table);

    // Statistiken
    const statsBox = createBadgeStatsBox(pilots, seasonInfo);
    container.appendChild(statsBox);

    // Info
    const infoBox = document.createElement('div');
    infoBox.className = 'badge-stats-info';
    infoBox.innerHTML = `
        <p class="info-text">* Es werden nur neue Badge-Level ab ${seasonInfo.start} (Saison ${seasonInfo.string}) gezählt</p>
    `;
    container.appendChild(infoBox);

    // Event Listener
    setTimeout(() => addBadgeDetailsEventListeners(), 100);
}

function renderNoBadgesMessage(container, pilots, seasonInfo) {
    const pilotsWithPreviousBadges = pilots.filter(p =>
        p.allTimeBadgeCount > 0 && p.badgeCount === 0
    ).length;

    container.innerHTML = `
        <div class="ranking-header">
            <h2 class="section-title">🏅 WeGlide Badges Saison ${seasonInfo.string}</h2>
            <div class="ranking-subtitle">Gesammelte Abzeichen seit ${seasonInfo.start}</div>
        </div>
        <div class="no-data">
            <p>Noch keine neuen Badges in der Saison ${seasonInfo.string} erreicht!</p>
            <p style="font-size: 14px; color: #666; margin-top: 10px;">
                ${pilotsWithPreviousBadges} Piloten haben Badges aus vorherigen Saisons
            </p>
        </div>
    `;
}

function createBadgeTable(pilotsWithBadges, seasonInfo, deltaMap = new Map()) {
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
            <th class="badges-count-col">
                <span class="table-header-icon table-header-svg-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                </span>
                Badges Saison
            </th>
            <th class="badges-categories-col">
                <span class="table-header-icon table-header-svg-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                        <path d="M12 2l-5.5 9h11z M12 22l5.5-9h-11z M3.5 9L9 2l-5.5 9z M20.5 9L15 2l5.5 9z M3.5 15L9 22l-5.5-9z M20.5 15L15 22l5.5-9z"/>
                    </svg>
                </span>
                Kategorien
            </th>
            <th class="badges-total-col">
                <span class="table-header-icon table-header-svg-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                </span>
                Badges Gesamt
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

    pilotsWithBadges.forEach((pilot, index) => {
        const row = createBadgeTableRow(pilot, index + 1, seasonInfo, deltaMap);
        tbody.appendChild(row);

        const detailsRow = createBadgeDetailsRow(pilot, seasonInfo);
        tbody.appendChild(detailsRow);
    });

    tableContainer.appendChild(table);
    return tableContainer;
}

function createBadgeTableRow(pilot, rank, seasonInfo, deltaMap = new Map()) {
    const row = document.createElement('tr');
    if (rank === 1) row.classList.add('first-place');
    else if (rank === 2) row.classList.add('second-place');
    else if (rank === 3) row.classList.add('third-place');

    const safeId = pilot.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const deltaBadge = RankingDeltas.badgeHTML(deltaMap.get(pilot.name));

    row.innerHTML = `
        <td class="rank-col">
            <span class="rank rank-${rank}">${rank}</span>
            ${deltaBadge}
        </td>
        <td class="pilot-col">
            <span class="pilot-name">${pilot.name}</span>
        </td>
        <td class="badges-count-col">
            <span class="badges-value">${pilot.badgeCount || 0}</span>
        </td>
        <td class="badges-categories-col">
            <span class="badges-categories-value">${pilot.badgeCategoryCount || 0}</span>
        </td>
        <td class="badges-total-col">
            <span class="badges-total-value">${pilot.allTimeBadgeCount || 0}</span>
        </td>
        <td class="details-col">
            <button class="toggle-badge-details"
                    data-pilot="${pilot.name}"
                    data-safe-id="${safeId}"
                    aria-expanded="false">
                Details
            </button>
        </td>
    `;

    return row;
}

function createBadgeDetailsRow(pilot, seasonInfo) {
    const safeId = pilot.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    const detailsRow = document.createElement('tr');
    detailsRow.className = 'badge-details-row';
    detailsRow.style.display = 'none';
    detailsRow.setAttribute('data-badge-details-for', safeId);

    const detailsCell = document.createElement('td');
    detailsCell.colSpan = 6;
    detailsCell.innerHTML = createBadgeGalleryHTML(pilot, seasonInfo);

    detailsRow.appendChild(detailsCell);
    return detailsRow;
}

/**
 * Erstellt HTML für die Badge-Galerie mit vereinfachter Sortierung
 * ANGEPASST: Gruppiert Multi-Level Badges zusammen
 */
function createBadgeGalleryHTML(pilot, seasonInfo) {
    const CDN = 'https://weglidefiles.b-cdn.net/';
    const uid = pilot.userId || pilot.user_id || pilot.id || '';
    let badges = Array.isArray(pilot.badges) ? pilot.badges
               : Array.isArray(pilot.seasonBadges) ? pilot.seasonBadges : [];

    let html = `
        <div class="badge-gallery-header">
            <h4>Saison Badges für ${pilot.name}</h4>
            <div class="badge-summary-info">
                <p class="badge-count-info">
                    <strong>${pilot.badgeCount || 0}</strong> Punkte aus
                    <strong>${pilot.badgeCategoryCount || badges.length}</strong> Badge-Kategorien
                </p>
            </div>
        </div>
    `;

    if (!badges.length) {
        html += `<div class="no-badges"><p>Keine Badges in dieser Saison</p></div>`;
        return html;
    }

    const emoji = (b) => getEmojiIcon(b);
    const iconHTML = (b) => {
        const logo = b.logo || (b.badge && b.badge.logo);
        return logo
            ? `<img src="${CDN}${logo}" alt="${b.name}" class="badge-image" onerror="this.style.display='none'; this.parentElement.innerHTML='${emoji(b)}';">`
            : emoji(b);
    };
    const startLevel = (b) => {
        const m = /Level\s+(\d+)\s*→\s*(\d+)/.exec(b.detail || '');
        return m ? parseInt(m[1], 10) : 0;
    };

    // Fortschritt zum naechsten Level (nur Multi-Level): naechste Schwelle aus badge.values.
    const progressHTML = (b) => {
        const vals = (b.badge && b.badge.values) || [];
        const end = b.level || 1;
        const unit = getUnitForBadgeType(b.badge_id);
        if (!vals.length) return '';
        if (end >= vals.length) {
            return `<div class="badge-progress badge-progress-max">🏆 Höchstes Level erreicht (Level ${end})</div>`;
        }
        const nextThreshold = vals[end]; // Level end+1 liegt bei Index end
        return `<div class="badge-progress">Nächstes Level (${end + 1}) ab <strong>${nextThreshold}${unit ? ` ${unit}` : ''}</strong></div>`;
    };

    // Seltenheit: wie viele Piloten haben dieses Badge diese Saison.
    const rarityHTML = (b) => {
        const info = _rarityMap.get(b.badge_id);
        if (!info || !info.total) return '';
        const { count, total } = info;
        const unique = count === 1;
        const rare = !unique && (count / total) <= 0.25;
        const cls = unique ? 'badge-rarity unique' : (rare ? 'badge-rarity rare' : 'badge-rarity');
        const tag = unique ? 'Einzigartig im Club' : (rare ? 'Selten' : '');
        return `<div class="${cls}">`
            + (tag ? `<span class="badge-rarity-tag">${tag}</span>` : '')
            + `<span class="badge-rarity-count">${count} von ${total} Piloten diese Saison</span></div>`;
    };

    const multiCard = (b) => {
        const end = b.level || 1;
        const gained = b.points || (end - startLevel(b));
        const unit = getUnitForBadgeType(b.badge_id);
        const vals = (b.badge && b.badge.values) || [];
        const threshold = vals[end - 1];
        let stacked = '';
        for (let i = 0; i < end; i++) {
            const offset = i * 8;
            stacked += `<div class="stacked-badge-icon" style="left:${offset}px; z-index:${end - i};">${iconHTML(b)}</div>`;
        }
        return `
            <div class="badge-item badge-verified badge-multi-level" title="${b.name} – Level-Verlauf anzeigen"
                 data-badge-id="${b.badge_id}" data-pilot-uid="${uid}" style="cursor:pointer;">
                <div class="badge-icon-stacked">${stacked}</div>
                <div class="badge-info">
                    <div class="badge-header-line">
                        <span class="badge-name">${b.name}</span>
                        <span class="badge-level-indicator">(Level ${end}${threshold ? ` – ${threshold} ${unit}` : ''})</span>
                    </div>
                    <div class="badge-description-indented">${b.description || ''}</div>
                    <div class="badge-achieved-value">+${gained} ${gained === 1 ? 'Level' : 'Level'} diese Saison</div>
                    ${progressHTML(b)}
                    ${rarityHTML(b)}
                    <div class="badge-level-timeline" data-filled="0" hidden></div>
                </div>
            </div>`;
    };

    const singleCard = (b) => `
            <div class="badge-item badge-verified badge-single-level" title="${b.name}"
                 data-badge-id="${b.badge_id}" data-pilot-uid="${uid}" data-flight-id="${b.flight_id || ''}" style="cursor:pointer;">
                <div class="badge-icon-stacked">
                    <div class="stacked-badge-icon" style="left:0; z-index:1;">${iconHTML(b)}</div>
                </div>
                <div class="badge-info">
                    <div class="badge-header-line"><span class="badge-name">${b.name}</span></div>
                    <div class="badge-description-indented">${b.description || ''}</div>
                    <div class="badge-achieved-value">Badge erreicht diese Saison</div>
                    ${rarityHTML(b)}
                </div>
            </div>`;

    const multi = badges.filter(b => b.type === 'multi-level');
    const single = badges.filter(b => b.type !== 'multi-level');

    html += '<div class="badge-gallery">';
    if (multi.length) {
        multi.sort((a, b) => (b.points || 0) - (a.points || 0));
        html += `<div class="badge-group"><h5 class="badge-group-title">Multi-Level Badges (${multi.length})</h5><div class="badge-grid badge-grid-multi-level">`;
        multi.forEach(b => { html += multiCard(b); });
        html += `</div></div>`;
    }
    if (single.length) {
        single.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        html += `<div class="badge-group"><h5 class="badge-group-title">Single-Level Badges (${single.length})</h5><div class="badge-grid">`;
        single.forEach(b => { html += singleCard(b); });
        html += `</div></div>`;
    }
    html += '</div>';
    return html;
}

// ---------------------------------------------------------------------------
// Level-Verlauf-Panel (wird beim Klick auf ein Multi-Level-Badge aufgeklappt)
// ---------------------------------------------------------------------------
function renderTimelineHTML(history) {
    if (!history || !history.length) {
        return `<div class="btl-empty">Noch kein Level-Verlauf gespeichert – wird ab dem nächsten täglichen Snapshot aufgebaut.</div>`;
    }
    const rows = [...history]
        .sort((a, b) => (a[0] || 0) - (b[0] || 0))
        .map(([level, date, fid]) => {
            const d = date ? formatDateForDisplay(date) : '—';
            const link = fid
                ? `<a class="btl-flight" href="https://www.weglide.org/flight/${fid}" target="_blank" rel="noopener">Flug ansehen ↗</a>`
                : `<span class="btl-noflight">kein Flugbezug</span>`;
            return `
                <div class="btl-row">
                    <span class="btl-level">Level ${level}</span>
                    <span class="btl-date">${d}</span>
                    ${link}
                </div>`;
        }).join('');
    return `<div class="btl-title">Level-Verlauf</div>${rows}`;
}

async function fillTimeline(panel, uid, badgeId) {
    if (!panel || panel.getAttribute('data-filled') === '1') return;
    panel.setAttribute('data-filled', '1');
    panel.innerHTML = `<div class="btl-loading">Lade Verlauf …</div>`;
    await loadBadgeHistory();
    const history = getBadgeLevelHistory(uid, badgeId);
    panel.innerHTML = renderTimelineHTML(history);
}

function toggleBadgeTimeline(item) {
    const panel = item.querySelector('.badge-level-timeline');
    if (!panel) return;
    const willOpen = panel.hasAttribute('hidden');

    // andere offene Panels in dieser Detail-Zeile schliessen
    const detailsRow = item.closest('.badge-details-row') || document;
    detailsRow.querySelectorAll('.badge-level-timeline').forEach(p => {
        if (p !== panel) {
            p.setAttribute('hidden', '');
            p.closest('.badge-item')?.classList.remove('badge-timeline-open');
        }
    });

    if (willOpen) {
        const uid = item.getAttribute('data-pilot-uid');
        const badgeId = item.getAttribute('data-badge-id');
        fillTimeline(panel, uid, badgeId);
        panel.removeAttribute('hidden');
        item.classList.add('badge-timeline-open');
    } else {
        panel.setAttribute('hidden', '');
        item.classList.remove('badge-timeline-open');
    }
}

/**
 * Hilfsfunktion: Erstellt HTML für die Badge-Zusammenfassung
 */
function createBadgeSummaryHTML(pilot) {
    return `
        <div class="badge-summary">
            <div class="summary-grid">
                <div class="summary-item">
                    <span class="summary-label">Gesamt Badges:</span>
                    <span class="summary-value">${pilot.badgeCount || 0}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Kategorien:</span>
                    <span class="summary-value">${pilot.badgeCategoryCount || 0}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Flüge mit Badges:</span>
                    <span class="summary-value">${pilot.flightsWithBadges || 0}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Analysierte Flüge:</span>
                    <span class="summary-value">${pilot.flightsAnalyzed || 0}</span>
                </div>
            </div>
            <p class="summary-note">
                Alle Badges wurden direkt aus den Flugdaten seit dem 1. Oktober 2024 extrahiert.
            </p>
        </div>
    `;
}

/**
 * Hilfsfunktion: Erstellt HTML für ein einzelnes Badge-Item
 * KORRIGIERT: Multi-Level Badges bleiben Multi-Level, auch wenn nur Level 1 erreicht
 */
function createBadgeItemHTML(badge, allBadgesOfSameType = []) {
    const achievedDate = formatDateForDisplay(badge.achieved_at || badge.flight_date || badge.created);
    const badgeTitle = badge.name || badge.badge?.name || 'Unbekanntes Badge';

    // KORRIGIERT: Prüfe ob es ein Multi-Level Badge ist (basierend auf der Badge-Definition)
    const isMultiLevel = badge.is_multi_level ||
        (badge.badge && badge.badge.values && Array.isArray(badge.badge.values) && badge.badge.values.length > 1) ||
        (badge.badge && badge.badge.points && Array.isArray(badge.badge.points) && badge.badge.points.length > 1);

    if (isMultiLevel) {
        // IMMER Multi-Level Card verwenden, wenn es ein Multi-Level Badge ist
        // Auch wenn nur 1 Badge dieses Typs erreicht wurde
        return createMultiLevelBadgeCard(badge, allBadgesOfSameType.length > 0 ? allBadgesOfSameType : [badge]);
    }

    // Standard Single-Badge Darstellung (nur für echte Single-Level Badges)
    const unit = getUnitForBadgeType(badge.badge_id);
    const achievedValue = badge.value;
    const formattedAchievedValue = achievedValue ?
        (Number.isInteger(achievedValue) ? achievedValue : parseFloat(achievedValue).toFixed(2)) : '';

    // Hole die Beschreibung
    let description = '';
    if (badge.description) {
        if (typeof badge.description === 'string') {
            description = badge.description;
        } else if (typeof badge.description === 'object') {
            description = badge.description.de || badge.description.en || '';
        }
    } else if (badge.badge && badge.badge.description) {
        if (typeof badge.badge.description === 'string') {
            description = badge.badge.description;
        } else if (typeof badge.badge.description === 'object') {
            description = badge.badge.description.de || badge.badge.description.en || '';
        }
    }

    // Single-Level Badge HTML (gleicher Style wie Multi-Level)
    return `
        <div class="badge-item badge-verified badge-single-level"
             title="${badgeTitle}"
             data-badge-id="${badge.badge_id}"
             data-flight-id="${badge.flight_id || ''}"
             data-value="${badge.value || ''}"
             style="cursor: pointer;">
            <div class="badge-icon-stacked">
                <div class="stacked-badge-icon" style="left: 0; z-index: 1;">
                    ${(badge.logo || badge.badge?.logo) ?
            `<img src="https://weglidefiles.b-cdn.net/${badge.logo || badge.badge?.logo}"
                              alt="${badgeTitle}"
                              class="badge-image"
                              onerror="this.style.display='none'; this.parentElement.innerHTML='${getEmojiIcon(badge)}';">` :
            getEmojiIcon(badge)
        }
                </div>

            </div>
            <div class="badge-info">
                <div class="badge-header-line">
                    <span class="badge-name">${badgeTitle}</span>
                </div>
                ${description ? `<div class="badge-description-indented">${description}</div>` : ''}
                <div class="badge-achieved-value">
                    ${formattedAchievedValue && unit ?
            `Erreichter Wert (${formattedAchievedValue} ${unit})` :
            badge.points > 0 ? `${badge.points} ${badge.points === 1 ? 'Punkt' : 'Punkte'}` :
                'Badge erreicht'
        }
                </div>
                <div class="badge-date-indented">${achievedDate}</div>
            </div>
        </div>
    `;
}

function createBadgeGalleryHTML_old(pilot, seasonInfo) {
    let html = `
        <div class="badge-gallery-header">
            <h4>Badges Saison ${seasonInfo.string} - ${pilot.name}</h4>
            <p class="badge-count-info">
                <strong>${pilot.badgeCount || 0}</strong> Badges aus
                <strong>${pilot.flightsWithBadges || 0}</strong> Flügen
            </p>
        </div>
    `;

    const badges = Array.isArray(pilot.badges) ? pilot.badges : [];

    if (badges.length === 0) {
        html += `<div class="no-badges">Keine Badges in der Saison ${seasonInfo.string}</div>`;
        return html;
    }

    html += '<div class="badge-gallery">';

    // Gruppiere und zeige Badges
    const badgeGroups = groupBadgesByType(badges);

    // Multi-Level Badges
    if (badgeGroups.multiLevel.length > 0) {
        html += renderBadgeGroup('Multi-Level Badges', badgeGroups.multiLevel);
    }

    // Single-Level Badges
    if (badgeGroups.singleLevel.length > 0) {
        html += renderBadgeGroup('Single-Level Badges', badgeGroups.singleLevel);
    }

    html += '</div>';
    return html;
}

function groupBadgesByType(badges) {
    const groups = {
        multiLevel: [],
        singleLevel: []
    };

    const badgeMap = new Map();

    badges.forEach(badge => {
        if (!badge.badge_id) return;

        if (!badgeMap.has(badge.badge_id)) {
            badgeMap.set(badge.badge_id, []);
        }
        badgeMap.get(badge.badge_id).push(badge);
    });

    badgeMap.forEach((badgeList, badgeId) => {
        const firstBadge = badgeList[0];
        const isMultiLevel = checkIfMultiLevel(firstBadge);

        if (isMultiLevel) {
            groups.multiLevel.push({
                badgeId,
                badges: badgeList.sort((a, b) => (a.level || 0) - (b.level || 0))
            });
        } else {
            groups.singleLevel.push(...badgeList);
        }
    });

    return groups;
}

function checkIfMultiLevel(badge) {
    return badge.type === 'multi-level' ||
        badge.is_multi_level ||
        (badge.badge?.values?.length > 1) ||
        (badge.badge?.points?.length > 1);
}

function renderBadgeGroup(title, badges) {
    let html = `
        <div class="badge-group">
            <h5 class="badge-group-title">${title}</h5>
            <div class="badge-grid">
    `;

    if (Array.isArray(badges[0]?.badges)) {
        // Multi-level badges
        badges.forEach(group => {
            html += createMultiLevelBadgeCard(group.badges[0], group.badges);
        });
    } else {
        // Single-level badges
        badges.forEach(badge => {
            html += createSingleBadgeCard(badge);
        });
    }

    html += '</div></div>';
    return html;
}

function createSingleBadgeCard(badge) {
    const title = badge.name || badge.badge_id || 'Badge';
    const date = formatDateForDisplay(badge.achieved_at || badge.created);
    const value = badge.value ? `${badge.value} ${getUnitForBadgeType(badge.badge_id)}` : '';

    return `
        <div class="badge-item badge-single-level"
             data-flight-id="${badge.flight_id || ''}"
             title="${title}">
            <div class="badge-name">${title}</div>
            ${value ? `<div class="badge-value">${value}</div>` : ''}
            <div class="badge-date">${date}</div>
        </div>
    `;
}

function createMultiLevelBadgeCard(baseBadge, allLevels) {
    // Sortiere Level
    const sortedLevels = [...allLevels].sort((a, b) => {
        const levelA = a.level || parseInt(a.value) || 0;
        const levelB = b.level || parseInt(b.value) || 0;
        return levelA - levelB;
    });

    // Finde höchstes erreichtes Level
    const highestLevel = sortedLevels[sortedLevels.length - 1];
    const badgeTitle = baseBadge.badge?.name || baseBadge.name || baseBadge.badge_id || 'Multi-Level Badge';

    // Hole die Original-Beschreibung
    let description = '';
    if (baseBadge.badge && baseBadge.badge.description) {
        if (typeof baseBadge.badge.description === 'string') {
            description = baseBadge.badge.description;
        } else if (typeof baseBadge.badge.description === 'object') {
            description = baseBadge.badge.description.de || baseBadge.badge.description.en || '';
        }
    }

    description = String(description || '');

    // Einheit für Badge-Typ
    const unit = getUnitForBadgeType(baseBadge.badge_id);
    const achievedValue = highestLevel.value;

    // Finde das korrekte Level basierend auf dem Wert
    let levelNumber = 0;
    let levelRequiredValue = achievedValue;

    if (baseBadge.badge && baseBadge.badge.values && Array.isArray(baseBadge.badge.values)) {
        // Finde das höchste Level, das der Pilot erreicht hat
        for (let i = baseBadge.badge.values.length - 1; i >= 0; i--) {
            if (achievedValue >= baseBadge.badge.values[i]) {
                levelNumber = i + 1;
                levelRequiredValue = baseBadge.badge.values[i];
                break;
            }
        }
    }

    const achievedDate = formatDateForDisplay(highestLevel.achieved_at || highestLevel.created || highestLevel.flight_date);

    // Formatiere den erreichten Wert
    const formattedAchievedValue = Number.isInteger(achievedValue) ? achievedValue : achievedValue.toFixed(2);

    // Erstelle gestapelte Icons für das Level
    let stackedIcons = '';
    for (let i = 0; i < levelNumber; i++) {
        const offset = i * 8; // Pixel-Offset für Überlappung
        stackedIcons += `
      <div class="stacked-badge-icon" style="left: ${offset}px; z-index: ${levelNumber - i};">
        ${(baseBadge.badge?.logo || baseBadge.logo) ?
                `<img src="https://weglidefiles.b-cdn.net/${baseBadge.badge?.logo || baseBadge.logo}"
                alt="${badgeTitle}"
                class="badge-image"
                onerror="this.style.display='none'; this.parentElement.innerHTML='${getEmojiIcon(baseBadge)}';">` :
                getEmojiIcon(baseBadge)
            }
      </div>
    `;
    }

    // Erstelle die Badge-Card
    return `
    <div class="badge-item badge-verified badge-multi-level"
         title="${badgeTitle}"
         data-badge-id="${baseBadge.badge_id}"
         data-flight-id="${highestLevel.flight_id || ''}"
         data-value="${achievedValue || ''}"
         style="cursor: pointer;">
      <div class="badge-icon-stacked">
        ${stackedIcons}
      </div>
      <div class="badge-info">
        <div class="badge-header-line">
          <span class="badge-name">${badgeTitle}</span>
          <span class="badge-level-indicator">(Level ${levelNumber} (${levelRequiredValue} ${unit}))</span>
        </div>
        <div class="badge-description-indented">${description}</div>
        <div class="badge-achieved-value">Erreichter Wert (${formattedAchievedValue} ${unit})</div>
        <div class="badge-date-indented">${achievedDate}</div>
      </div>
    </div>
  `;
}

function createBadgeStatsBox(pilots, seasonInfo) {
    const statsContainer = document.createElement('div');
    statsContainer.className = 'badge-stats-container';

    const totalBadges = pilots.reduce((sum, p) => sum + (p.badgeCount || 0), 0);
    const pilotsWithBadges = pilots.filter(p => p.badgeCount > 0).length;

    statsContainer.innerHTML = `
        <div class="badge-stats-grid">
            <div class="badge-stat-card">
                <div class="stat-value">${totalBadges}</div>
                <div class="stat-label">Badges Saison ${seasonInfo.shortString}</div>
            </div>
            <div class="badge-stat-card">
                <div class="stat-value">${pilotsWithBadges}</div>
                <div class="stat-label">Piloten mit Badges</div>
            </div>
        </div>
    `;

    return statsContainer;
}

function getUnitForBadgeType(badgeId) {
    if (!badgeId) return '';
    const id = badgeId.toLowerCase();

    if (id.includes('astronaut') || id.includes('altitude') || id.includes('height')) return 'm';
    if (id.includes('distance') || id.includes('triangle') || id.includes('km') || id.includes('no_need_to_circle') || id.includes('explorer')) return 'km';
    if (id.includes('duration') || id.includes('hour') || id.includes('endurance') || id.includes('aeronaut')) return 'h';
    if (id.includes('speed')) return 'km/h';
    if (id.includes('points') || id.includes('score')) return 'pt';

    return '';
}

function addBadgeDetailsEventListeners_old() {
    // Warte kurz, damit DOM fertig ist
    setTimeout(() => {
        const buttons = document.querySelectorAll('.toggle-badge-details');

        buttons.forEach(button => {
            // Entferne alte Listener
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);

            // Füge neuen Listener hinzu
            newButton.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const safeId = this.getAttribute('data-safe-id');
                const detailsRow = document.querySelector(`[data-badge-details-for="${safeId}"]`);

                if (!detailsRow) {
                    console.error('Details-Zeile nicht gefunden für:', safeId);
                    return;
                }

                const isVisible = detailsRow.style.display === 'table-row';

                // Alle anderen schließen
                document.querySelectorAll('.badge-details-row').forEach(row => {
                    row.style.display = 'none';
                });

                // Toggle diese Zeile
                if (!isVisible) {
                    detailsRow.style.display = 'table-row';
                    this.setAttribute('aria-expanded', 'true');
                } else {
                    detailsRow.style.display = 'none';
                    this.setAttribute('aria-expanded', 'false');
                }
            });
        });
    }, 100);
}

/**
 * Event Listener für Badge-Details
 */
function addBadgeDetailsEventListeners() {
    const buttons = document.querySelectorAll('.toggle-badge-details');
    console.log(`Füge Event Listener zu ${buttons.length} Badge-Buttons hinzu`);

    buttons.forEach(button => {
        if (button.hasAttribute('data-badge-listener-added')) return;
        button.setAttribute('data-badge-listener-added', 'true');

        button.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const safeId = this.getAttribute('data-safe-id');
            const pilotName = this.getAttribute('data-pilot');
            const currentRow = this.closest('tr');
            const detailsRow = currentRow.nextElementSibling;

            console.log(`Badge-Details geklickt für: ${pilotName}`);

            if (detailsRow && detailsRow.classList.contains('badge-details-row')) {
                const isVisible = detailsRow.style.display !== 'none';

                // Alle anderen schließen
                document.querySelectorAll('.badge-details-row').forEach(row => {
                    row.style.display = 'none';
                });
                document.querySelectorAll('.toggle-badge-details').forEach(btn => {
                    btn.setAttribute('aria-expanded', 'false');
                    const svg = btn.querySelector('svg');
                    if (svg) svg.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
                });

                if (!isVisible) {
                    // Diese öffnen
                    detailsRow.style.display = 'table-row';
                    detailsRow.style.visibility = 'visible';
                    this.setAttribute('aria-expanded', 'true');
                    const svg = this.querySelector('svg');
                    if (svg) svg.innerHTML = '<polyline points="18 15 12 9 6 15"></polyline>';

                    // Scroll to view
                    setTimeout(() => {
                        detailsRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 100);

                    // Badge-Items klickbar machen
                    setTimeout(() => {
                        makeBadgeItemsClickable(detailsRow);
                    }, 200);
                }
            }
        });
    });
}


/**
 * Generiert ein Badge-Icon basierend auf dem Badge-Typ
 */
function getEmojiIcon(badge) {
    const badgeType = getBadgeTypeFromId(badge.badge_id || badge.id);
    const typeIcons = {
        'altitude': '🏔️',
        'distance': '📏',
        'duration': '⏱️',
        'speed': '⚡',
        'points': '🎯',
        'xc': '🗺️',
        'special': '⭐',
        'social': '📸',
        'timing': '🕐',
        'weather': '🌤️',
        'team': '👥',
        'travel': '✈️',
        'consistency': '📊',
        'other': '🏅'
    };

    return typeIcons[badgeType] || '🏅';
}

/**
 * Bestimmt den Badge-Typ basierend auf der badge_id
 * (Wird nur noch für Emoji-Icons verwendet)
 */
function getBadgeTypeFromId(badgeId) {
    if (!badgeId) return 'other';

    const id = badgeId.toLowerCase();

    // Höhen-Badges
    if (id.includes('astronaut') || id.includes('altitude') || id.includes('height') ||
        id.includes('high') || id.includes('climb') || id.includes('aeronaut') || id.includes('yogi')) {
        return 'altitude';
    }

    // Distanz-Badges
    if (id.includes('distance') || id.includes('km') || id.includes('triangle') ||
        id.includes('fai') || id.includes('straight') || id.includes('no_need_to_circle') ||
        id.includes('bring_it_home') || id.includes('zugvogel') || id.includes('explorer') ||
        id.includes('euclid') || id.includes('clean_sheet') || id.includes('pythagoras') || id.includes('mission_completed')) {
        return 'distance';
    }

    // Dauer-Badges
    if (id.includes('duration') || id.includes('hour') || id.includes('time') ||
        id.includes('endurance')) {
        return 'duration';
    }

    // Geschwindigkeits-Badges
    if (id.includes('speed') || id.includes('fast') || id.includes('quick') ||
        id.includes('velocity') || id.includes('sprinter')) {
        return 'speed';
    }

    // Streckenflug-Badges
    if (id.includes('xc') || id.includes('cross') || id.includes('country') ||
        id.includes('olc')) {
        return 'xc';
    }

    // Punkte-Badges
    if (id.includes('points') || id.includes('score') || id.includes('scoring') ||
        id.includes('point_hunter')) {
        return 'points';
    }

    // Spezial-Badges
    if (id.includes('first') || id.includes('special') || id.includes('club') ||
        id.includes('pioneer') || id.includes('achievement') || id.includes('silver') ||
        id.includes('gold') || id.includes('diamond')) {
        return 'special';
    }

    // Social-Badges
    if (id.includes('photo') || id.includes('story') || id.includes('share') ||
        id.includes('social')) {
        return 'social';
    }

    // Zeit-basierte Badges
    if (id.includes('weekend') || id.includes('weekday') || id.includes('early') ||
        id.includes('late') || id.includes('night')) {
        return 'timing';
    }

    // Wetter-Badges
    if (id.includes('weather') || id.includes('wind') || id.includes('thermal') ||
        id.includes('wave')) {
        return 'weather';
    }

    // Team/Crew Badges
    if (id.includes('cockpit_crew') || id.includes('crew') || id.includes('team') ||
        id.includes('always_by_your_side') || id.includes('copilot') || id.includes('duo')) {
        return 'team';
    }

    // Reise/Nomaden Badges
    if (id.includes('nomad') || id.includes('travel') || id.includes('journey') ||
        id.includes('aircraft_hopper') || id.includes('hopper')) {
        return 'travel';
    }

    // Konsistenz/Regelmäßigkeit Badges
    if (id.includes('consistency') || id.includes('regular') || id.includes('streak') ||
        id.includes('daily') || id.includes('weekly') || id.includes('monthly') || id.includes('yin_yang') || id.includes('flying_spree')) {
        return 'consistency';
    }

    return 'other';
}

function makeBadgeItemsClickable(detailsRow) {
    detailsRow.querySelectorAll('.badge-item').forEach(item => {
        if (item.hasAttribute('data-click-bound')) return;
        item.setAttribute('data-click-bound', 'true');

        item.addEventListener('click', function (e) {
            // Klicks auf echte Links (z.B. "Flug ansehen" im Verlauf) durchlassen
            if (e.target.closest('a')) return;

            // Multi-Level: Level-Verlauf aus badge-history-latest.json aufklappen
            if (this.classList.contains('badge-multi-level')) {
                e.preventDefault();
                e.stopPropagation();
                toggleBadgeTimeline(this);
                return;
            }

            // Single-Level: wie bisher den Flug öffnen
            const flightId = this.getAttribute('data-flight-id');
            if (flightId) {
                window.open(`https://www.weglide.org/flight/${flightId}`, '_blank');
            }
        });
    });
}
