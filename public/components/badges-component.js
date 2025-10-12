/**
 * SG Säntis Cup - WeGlide Badges Komponente
 * Version 4.0 - Bereinigt mit dynamischer Saison
 */

import { formatDateForDisplay } from '../utils/utils.js';

// Hilfsfunktion für Saison-Information
function getSeasonInfo(pilots) {
    const season = pilots[0]?.season || getCurrentSeasonYear();
    const seasonYear = typeof season === 'string' ? parseInt(season) : season;

    return {
        year: seasonYear,
        string: seasonYear === 2026 ? '2025/2026' : '2024/2025',
        start: seasonYear === 2026 ? 'Oktober 2025' : 'Oktober 2024',
        shortString: seasonYear === 2026 ? '25/26' : '24/25'
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

    container.innerHTML = '';
    const seasonInfo = getSeasonInfo(pilots);

    if (!Array.isArray(pilots) || pilots.length === 0) {
        container.innerHTML = '<div class="no-data">Keine Badge-Daten verfügbar</div>';
        return;
    }

    const pilotsWithBadges = pilots
        .filter(pilot => pilot.badgeCount > 0)
        .sort((a, b) => b.badgeCount - a.badgeCount);

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
    `;
    container.appendChild(header);

    // Tabelle
    const table = createBadgeTable(pilotsWithBadges, seasonInfo);
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

function createBadgeTable(pilotsWithBadges, seasonInfo) {
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
                Badges 24/25
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
        const row = createBadgeTableRow(pilot, index + 1, seasonInfo);
        tbody.appendChild(row);

        const detailsRow = createBadgeDetailsRow(pilot, seasonInfo);
        tbody.appendChild(detailsRow);
    });

    tableContainer.appendChild(table);
    return tableContainer;
}

function createBadgeTableRow(pilot, rank, seasonInfo) {
    const row = document.createElement('tr');
    if (rank === 1) row.classList.add('first-place');
    else if (rank === 2) row.classList.add('second-place');
    else if (rank === 3) row.classList.add('third-place');

    const safeId = pilot.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    row.innerHTML = `
        <td class="rank-col">
            <span class="rank rank-${rank}">${rank}</span>
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
function createBadgeGalleryHTML(pilot) {
    // Debug-Ausgabe
    console.log(`🔍 Badge-Galerie für ${pilot.name}:`, {
        badges: pilot.badges,
        badgeCount: pilot.badgeCount,
        seasonBadges: pilot.seasonBadges,
        typeOfBadges: typeof pilot.badges,
        flightsWithBadges: pilot.flightsWithBadges
    });

    let html = `
        <div class="badge-gallery-header">
            <h4>Badges Saison 2024/2025 - ${pilot.name}</h4>
            <div class="badge-summary-info">
                <p class="badge-count-info">
                    <strong>${pilot.badgeCount || 0}</strong> Badges aus 
                    <strong>${pilot.flightsWithBadges || 0}</strong> von 
                    <strong>${pilot.flightsAnalyzed || 0}</strong> Flügen
                </p>
                ${pilot.badgeCategoryCount ?
            `<p class="badge-category-info">
                        <strong>${pilot.badgeCategoryCount}</strong> verschiedene Badge-Kategorien
                        ${pilot.multiLevelBadgeCount > 0 ?
                ` • <strong>${pilot.multiLevelBadgeCount}</strong> Multi-Level Badges` : ''
            }
                    </p>` : ''
        }
            </div>
        </div>
    `;

    // Sicherstellen, dass wir ein Array haben
    let badges = [];
    
    // Verschiedene Möglichkeiten prüfen
    if (Array.isArray(pilot.badges)) {
        badges = pilot.badges;
    } else if (Array.isArray(pilot.seasonBadges)) {
        badges = pilot.seasonBadges;
    } else if (pilot.badges && typeof pilot.badges === 'object') {
        // Falls es ein Objekt ist, versuche es in ein Array zu konvertieren
        badges = Object.values(pilot.badges);
    } else {
        // Fallback: Leeres Array
        badges = [];
    }

    console.log(`  → Badges nach Konvertierung: ${badges.length} Items`);

    // Keine Badges gefunden
    if (!badges || badges.length === 0) {
        html += `
            <div class="no-badges">
                <p>Keine Badges in der Saison 2024/2025 gefunden</p>
                <p class="no-badges-hint">
                    ${pilot.flightsAnalyzed > 0 ?
                `${pilot.flightsAnalyzed} Flüge wurden analysiert, aber keine enthielten Achievements.` :
                'Keine Flüge seit Saisonbeginn (1. Oktober 2024) gefunden.'
            }
                </p>
            </div>
        `;
        return html;
    }

    html += '<div class="badge-gallery">';

    // Gruppiere Badges nach badge_id für Multi-Level Zusammenfassung
    const badgeGroups = new Map();
    
    // Sicherstellen, dass forEach funktioniert
    if (typeof badges.forEach === 'function') {
        badges.forEach(badge => {
            if (badge && badge.badge_id) {
                const badgeId = badge.badge_id;
                if (!badgeGroups.has(badgeId)) {
                    badgeGroups.set(badgeId, []);
                }
                badgeGroups.get(badgeId).push(badge);
            }
        });
    } else {
        console.error('badges.forEach ist keine Funktion:', badges);
    }

    // Separiere Multi-Level und Single-Level Badges
    const multiLevelGroups = [];
    const singleLevelBadges = [];

    badgeGroups.forEach((badgeGroup, badgeId) => {
        // KORRIGIERT: Prüfe ob das Badge selbst Multi-Level ist
        const firstBadge = badgeGroup[0];
        if (!firstBadge) return;

        const isMultiLevel = firstBadge.type === 'multi-level' ||
            firstBadge.is_multi_level ||
            (firstBadge.badge && firstBadge.badge.values && Array.isArray(firstBadge.badge.values) && firstBadge.badge.values.length > 1) ||
            (firstBadge.badge && firstBadge.badge.points && Array.isArray(firstBadge.badge.points) && firstBadge.badge.points.length > 1) ||
            (firstBadge.seasonPoints && firstBadge.seasonPoints > 1);

        if (isMultiLevel) {
            // Multi-Level Badge (unabhängig davon, wie viele der Pilot hat)
            multiLevelGroups.push({
                badgeId: badgeId,
                badges: badgeGroup.sort((a, b) => (a.level || a.value || 0) - (b.level || b.value || 0))
            });
        } else {
            // Nur echte Single-Level Badges
            singleLevelBadges.push(...badgeGroup);
        }
    });

    // Multi-Level Badges anzeigen (gruppiert)
    if (multiLevelGroups.length > 0) {
        html += `<div class="badge-group">`;
        html += `<h5 class="badge-group-title">Multi-Level Badges (${multiLevelGroups.length})</h5>`;
        html += `<div class="badge-grid badge-grid-multi-level">`;

        multiLevelGroups.forEach(group => {
            html += createBadgeItemHTML(group.badges[0], group.badges);
        });

        html += `</div></div>`;
    }

    // Single-Level Badges anzeigen
    if (singleLevelBadges.length > 0) {
        html += `<div class="badge-group">`;
        html += `<h5 class="badge-group-title">Single-Level Badges (${singleLevelBadges.length})</h5>`;
        html += `<div class="badge-grid">`;

        // Sortiere Single-Level Badges alphabetisch nach Name
        singleLevelBadges.sort((a, b) => {
            const nameA = (a && a.name) || (a && a.badge_id) || '';
            const nameB = (b && b.name) || (b && b.badge_id) || '';
            return nameA.localeCompare(nameB);
        });

        singleLevelBadges.forEach(badge => {
            html += createBadgeItemHTML(badge);
        });

        html += `</div></div>`;
    }

    html += '</div>';

    // Statistik-Bereich
    if (pilot.badgeStats || pilot.stats) {
        html += createBadgeStatisticsHTML(pilot);
    }

    // Zusammenfassung
    html += createBadgeSummaryHTML(pilot);

    return html;
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
        item.addEventListener('click', function () {
            const flightId = this.getAttribute('data-flight-id');
            if (flightId) {
                window.open(`https://www.weglide.org/flight/${flightId}`, '_blank');
            }
        });
    });
}