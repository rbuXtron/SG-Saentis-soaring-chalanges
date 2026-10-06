/**
 * SG Säntis Cup - "Mein Jahr" (persönliche Saison-Bilanz pro Pilot)
 * Version 1.0
 *   Pilotenauswahl (gemerkt im Browser), Hero-Kacheln, Fortschritt,
 *   Badges der Saison, beste 3 Flüge, persönliche Bestwerte.
 *   Benötigt my-year.css.
 */

import { formatNumber, formatDateForDisplay } from '../utils/utils.js';

const LS_KEY = 'sgMyYearPilot';

// Vorsaison-Punkte (season-points-<N-1>.json) für den Vergleich
let _prevPoints = null;        // { name: points }
let _prevPointsPromise = null;

function loadPrevPoints(seasonYear) {
  if (_prevPointsPromise) return _prevPointsPromise;
  _prevPointsPromise = (async () => {
    const map = {};
    try {
      const res = await fetch(`./data/season-points-${seasonYear - 1}.json`, { cache: 'no-cache' });
      if (res.ok) {
        const d = await res.json();
        for (const p of Object.values(d.pilots || {})) {
          if (p && p.name) map[p.name] = p.points || 0;
        }
      }
    } catch (_) { /* keine Vorsaison-Punkte -> Vergleich entfällt */ }
    _prevPoints = map;
    return map;
  })();
  return _prevPointsPromise;
}

// ---- Avatar (WeGlide-Foto via Proxy, Fallback Initialen) ------------------
function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

async function loadPhoto(pilot, imgEl) {
  if (!imgEl) return;
  let img = pilot.avatar || pilot.image;
  if (!img) {
    const uid = pilot.userId || pilot.user_id || pilot.id;
    if (!uid) return;
    try {
      const res = await fetch(`/api/proxy?path=user/${uid}`, { cache: 'force-cache' });
      if (res.ok) { const u = await res.json(); if (u && u.image) pilot.avatar = img = u.image; }
    } catch (_) { return; }
  }
  if (!img) return;
  const url = /^https?:\/\//.test(img) ? img : 'https://weglidefiles.b-cdn.net/' + String(img).replace(/^\/+/, '');
  imgEl.onerror = () => imgEl.remove();
  imgEl.src = url;
}

// ---- Kennzahlen aus den Pilotendaten --------------------------------------
const nf = (n) => formatNumber(n);

function metrics(pilot) {
  const all = Array.isArray(pilot.allFlights) ? pilot.allFlights : [];
  const totalKm = all.reduce((s, f) => s + (f.km || 0), 0);
  const seconds = all.reduce((s, f) => s + (f.duration || 0), 0);
  const hours = seconds / 3600;

  let longest = null, fastest = null, bestWg = null;
  all.forEach(f => {
    if (!longest || (f.km || 0) > longest.km) longest = { km: f.km || 0, date: f.date, fid: f.rawData?.id };
    if (!fastest || (f.speed || 0) > fastest.speed) fastest = { speed: f.speed || 0, date: f.date };
    if (!bestWg || (f.originalPoints || 0) > bestWg.pts) bestWg = { pts: f.originalPoints || 0, date: f.date };
  });

  const bestDist = pilot.bestDistance || 0;
  const prevBestDist = Math.max(0, bestDist - (pilot.seasonBestDistance || 0));
  return { totalKm, hours, longest, fastest, bestWg, bestDist, prevBestDist, flights: all.length };
}

const TIERS = [[50, 4.0], [100, 3.0], [300, 2.0], [500, 1.6], [700, 1.4], [1000, 1.2], [Infinity, 1.0]];
function nextFactorGoal(bestDist) {
  for (let i = 0; i < TIERS.length; i++) {
    if (bestDist <= TIERS[i][0]) {
      const next = TIERS[i + 1];
      return next ? { goal: TIERS[i][0], factor: next[1] } : null;
    }
  }
  return null;
}

function deltaBadge(cur, prev, unit) {
  if (!prev) return '<span class="my-delta up">neu</span>';
  const d = cur - prev;
  if (Math.round(d) === 0) return '<span class="my-delta">±0</span>';
  const cls = d > 0 ? 'up' : 'down', sign = d > 0 ? '+' : '';
  return `<span class="my-delta ${cls}">${sign}${nf(Math.round(d))}${unit || ''}</span>`;
}

// ---- Rendering ------------------------------------------------------------
export function renderMyYear(pilots, containerId = 'mein-jahr') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const valid = (Array.isArray(pilots) ? pilots : []).filter(p => (p.allFlights?.length || 0) > 0);
  if (!valid.length) {
    container.innerHTML = '<div class="no-data">Noch keine Flüge in dieser Saison</div>';
    return;
  }

  const seasonYear = pilots[0]?.season || new Date().getFullYear();
  const seasonStr = `${seasonYear - 1}/${seasonYear}`;

  // Rang über alle gewerteten Piloten
  const rankMap = new Map();
  [...pilots].filter(p => (p.totalPoints || 0) > 0)
    .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
    .forEach((p, i) => rankMap.set(p.userId, i + 1));

  // gemerkte Auswahl
  let savedUid = null;
  try { savedUid = localStorage.getItem(LS_KEY); } catch (_) { }
  let selected = valid.find(p => String(p.userId) === String(savedUid)) || valid[0];

  const options = [...valid]
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(p => `<option value="${p.userId}" ${p.userId === selected.userId ? 'selected' : ''}>${p.name}</option>`)
    .join('');

  container.innerHTML = `
    <div class="myyear">
      <div class="my-head">
        <div class="my-title">
          <h2>Mein Jahr</h2>
          <div class="my-sub">Saison ${seasonStr} <span class="dot"></span> deine persönliche Bilanz</div>
        </div>
        <label class="my-pick-wrap">Pilot
          <select class="my-pick" id="my-pick" aria-label="Pilot wählen">${options}</select>
        </label>
      </div>
      <div id="my-detail"></div>
    </div>`;

  const pick = container.querySelector('#my-pick');
  const draw = (p) => {
    renderDetail(container.querySelector('#my-detail'), p, rankMap.get(p.userId), seasonYear);
    const imgEl = container.querySelector('#my-detail .my-ava-img');
    loadPhoto(p, imgEl);
  };

  pick.addEventListener('change', () => {
    const p = valid.find(x => String(x.userId) === pick.value) || selected;
    selected = p;
    try { localStorage.setItem(LS_KEY, String(p.userId)); } catch (_) { }
    draw(p);
  });

  // Vorsaison-Punkte laden, dann erst zeichnen (für den Vergleich)
  loadPrevPoints(seasonYear).then(() => draw(selected));
  draw(selected); // Sofort zeichnen (Vergleich erscheint, sobald geladen)
}

function renderDetail(host, p, rank, seasonYear) {
  if (!host) return;
  const m = metrics(p);
  const prevPts = (_prevPoints && _prevPoints[p.name]) || 0;
  const goal = nextFactorGoal(m.bestDist);
  const seasonKmDelta = m.bestDist - m.prevBestDist;

  const CDN = 'https://weglidefiles.b-cdn.net/';
  const badges = Array.isArray(p.badges) ? p.badges : [];
  const badgeList = [...badges]
    .sort((a, b) => (b.points || 0) - (a.points || 0) || (a.name || '').localeCompare(b.name || ''))
    .map(b => {
      const single = b.type !== 'multi-level';
      const lvl = b.level || 1;
      const gained = b.points || 0;
      const logo = b.logo || (b.badge && b.badge.logo);
      const icon = `<div class="my-bicon ${single ? 'single' : ''}">
          <span class="my-bfallback">${single ? '★' : ('L' + lvl)}</span>
          ${logo ? `<img class="my-bimg" src="${CDN}${logo}" alt="" loading="lazy" onerror="this.remove()">` : ''}
          ${single ? '' : `<span class="my-lvlpip">L${lvl}</span>`}
        </div>`;
      return `<div class="my-bitem">
        ${icon}
        <div><div class="my-bn">${b.name || b.badge_id || 'Badge'}
          <span class="my-newtag">${gained > 0 ? '+' + gained : 'NEU'}</span></div>
          <div class="my-bl">${single ? 'Badge erreicht' : 'Level ' + lvl + ' · +' + gained + ' diese Saison'}</div></div>
      </div>`;
    }).join('') || '<div class="no-data" style="grid-column:1/-1">Noch keine neuen Badges diese Saison</div>';

  const best3 = [...(p.flights || [])]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .map(f => {
      const fid = f.rawData?.id;
      const dc = fid ? `<a href="https://www.weglide.org/flight/${fid}" target="_blank" rel="noopener">${formatDateForDisplay(f.date)}</a>` : formatDateForDisplay(f.date);
      return `<tr>
        <td class="l">${dc}</td><td class="l">${f.aircraftType || '-'}</td>
        <td class="tnum">${(f.km || 0).toFixed(1)}</td>
        <td class="tnum">${f.pilotFactor != null ? f.pilotFactor.toFixed(1) : '-'}</td>
        <td class="l">${f.takeoffAirportName || '-'} <span class="taf">(${f.takeoffFactor != null ? f.takeoffFactor : 0.8})</span></td>
        <td class="tnum"><strong>${(f.points || 0).toFixed(2)}</strong></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6">Keine Flugdaten</td></tr>';

  const longLink = m.longest && m.longest.fid
    ? ` · <a href="https://www.weglide.org/flight/${m.longest.fid}" target="_blank" rel="noopener" class="my-flink">Flug ansehen ↗</a>` : '';

  host.innerHTML = `
    <div class="my-me">
      <div class="my-ava"><span class="my-ava-fallback">${initialsOf(p.name)}</span><img class="my-ava-img" alt="" loading="lazy"></div>
      <div>
        <div class="my-name">${p.name}</div>
        <div class="my-pills"><span class="my-pill">Rang ${rank || '–'}</span><span class="my-faint">Saison ${seasonYear - 1}/${seasonYear}</span></div>
      </div>
    </div>

    <div class="my-tiles">
      <div class="my-tile hl"><div class="k">Cup-Punkte</div><div class="v tnum">${nf(Math.round(p.totalPoints || 0))}</div><div class="x">Rang ${rank || '–'} im Club</div></div>
      <div class="my-tile"><div class="k">Flüge</div><div class="v tnum">${m.flights}</div><div class="x">diese Saison</div></div>
      <div class="my-tile"><div class="k">Kilometer</div><div class="v tnum">${nf(Math.round(m.totalKm))}<small> km</small></div><div class="x">gesamt</div></div>
      <div class="my-tile"><div class="k">Flugstunden</div><div class="v tnum">${m.hours.toFixed(1)}<small> h</small></div><div class="x">Luftzeit</div></div>
    </div>

    <div class="my-sectlabel">Fortschritt</div>
    <div class="my-cards2">
      <div class="my-card">
        <h3>Pilotenfaktor</h3>
        <div class="my-kv"><span class="lab">Aktueller Faktor</span><span class="val">${(p.pilotFactor || 0).toFixed(1)}</span></div>
        <div class="my-kv"><span class="lab">Saison-Bestdistanz</span><span class="val">${nf(Math.round(m.bestDist))} km</span></div>
        <div class="my-kv"><span class="lab">vs. Vorsaison</span><span class="val">${deltaBadge(m.bestDist, m.prevBestDist, ' km')}</span></div>
        ${goal ? `
        <div class="my-prog">
          <div class="meta"><span>Nächster Faktor ${goal.factor.toFixed(1)}</span><span><b>${nf(Math.round(m.bestDist))}</b> / ${nf(goal.goal)} km</span></div>
          <div class="my-pbar"><i style="width:${Math.min(100, Math.round(m.bestDist / goal.goal * 100))}%"></i></div>
          <div class="my-x">Noch <b class="tnum">${nf(Math.max(0, Math.round(goal.goal - m.bestDist)))}</b> km bis Faktor ${goal.factor.toFixed(1)}</div>
        </div>` : `<div class="my-x" style="color:var(--my-green)">🏆 Bester Faktor erreicht</div>`}
      </div>
      <div class="my-card">
        <h3>Gegenüber der Vorsaison</h3>
        <div class="my-kv"><span class="lab">Cup-Punkte</span><span class="val">${nf(Math.round(p.totalPoints || 0))} ${prevPts ? deltaBadge(p.totalPoints || 0, prevPts) : '<span class="my-faint" style="font-size:11px">kein Vorjahr</span>'}</span></div>
        <div class="my-kv"><span class="lab">Weiteste Distanz</span><span class="val">${nf(Math.round(m.bestDist))} km ${deltaBadge(m.bestDist, m.prevBestDist)}</span></div>
        <div class="my-kv"><span class="lab">Badges (Saison)</span><span class="val">${p.badgeCount || 0} Pkt</span></div>
        <div class="my-x" style="margin-top:12px;color:var(--text-secondary)">${seasonKmDelta > 0
          ? `Du bist dieses Jahr <b style="color:var(--my-green)">${nf(Math.round(seasonKmDelta))} km</b> weiter geflogen als letzte Saison.`
          : `Noch Luft nach oben – letzte Saison standen ${nf(Math.round(m.prevBestDist))} km.`}</div>
      </div>
    </div>

    <div class="my-sectlabel">Badges dieses Jahr</div>
    <div class="my-badgewrap">
      <div class="my-bsum">
        <div class="s"><b class="tnum">${p.badgeCount || 0}</b><small>Punkte Saison</small></div>
        <div class="s"><b class="tnum">${p.badgeCategoryCount || 0}</b><small>Kategorien</small></div>
        <div class="s"><b class="tnum">${p.allTimeBadgeCount || 0}</b><small>Badges gesamt</small></div>
      </div>
      <div class="my-bgrid">${badgeList}</div>
    </div>

    <div class="my-sectlabel">Beste 3 Flüge</div>
    <div class="my-ftwrap">
      <table class="my-ft"><thead><tr>
        <th class="l">Datum</th><th class="l">Flugzeug</th><th>km</th><th title="Pilotenfaktor">P-Fkt</th><th class="l">Startplatz</th><th>Punkte</th>
      </tr></thead><tbody>${best3}</tbody></table>
    </div>

    <div class="my-sectlabel">Persönliche Bestwerte</div>
    <div class="my-pb">
      <div class="my-pbcard gold"><div class="k">Längster Flug</div><div class="v tnum">${m.longest ? nf(Math.round(m.longest.km)) : '–'}<small> km</small></div><div class="x">${m.longest ? formatDateForDisplay(m.longest.date) : ''}${longLink}</div></div>
      <div class="my-pbcard"><div class="k">Schnellster Schnitt</div><div class="v tnum">${m.fastest ? Math.round(m.fastest.speed) : '–'}<small> km/h</small></div><div class="x">${m.fastest ? formatDateForDisplay(m.fastest.date) : ''}</div></div>
      <div class="my-pbcard green"><div class="k">Beste WeGlide-Punkte</div><div class="v tnum">${m.bestWg ? nf(Math.round(m.bestWg.pts)) : '–'}</div><div class="x">${m.bestWg ? formatDateForDisplay(m.bestWg.date) : ''}</div></div>
    </div>`;
}
