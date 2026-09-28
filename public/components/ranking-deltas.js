/**
 * ranking-deltas.js  —  SG Säntis Cup  (ES-Modul-Version)
 * ------------------------------------------------------------------
 * Sichtbare Ranglisten-Bewegung:
 *   • Deltas mit Pfeilen  ▲ grün (hoch) / ▼ rot (runter)
 *   • "Aufsteiger der Woche"
 *   • Momentum-Indikator pro Pilot
 *   • FLIP-Animation beim Neuladen (Zeilen gleiten statt springen)
 *
 * Import in main-app.js (Pfad relativ zu main-app.js anpassen):
 *   import * as RankingDeltas from './components/ranking-deltas.js';
 *
 * Vertrag:
 *   Piloten IN ANZEIGE-REIHENFOLGE übergeben (oben = Index 0).
 *   Rang = Array-Position -> dein Scoring muss hier nicht bekannt sein.
 *   Schlüssel pro Pilot = pilot.name; jede Tabellenzeile trägt
 *   data-pilot="<name>" (für Animation und den Snapshot-Scraper).
 * ------------------------------------------------------------------
 */

const CONFIG = {
  storageKeyPrefix: 'sgcup_rank_snapshots_',
  baselineAgeDays: 7,
  baselineMinAgeDays: 4,
  commitMinIntervalHours: 20,
  maxHistory: 40,
  animationDuration: 450,
};

// ---- Saison Okt–Sep -> "2025-2026" -------------------------------
export function currentSeasonKey(date = new Date()) {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 9 ? y : y - 1;
  return `${startYear}-${startYear + 1}`;
}

// ---- Snapshot-Quelle ---------------------------------------------
let _snapshotProvider = null; // optional externe (geteilte) Quelle

function _storageKey() { return CONFIG.storageKeyPrefix + currentSeasonKey(); }

function _loadHistory() {
  try {
    const raw = localStorage.getItem(_storageKey());
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function _saveHistory(hist) {
  try { localStorage.setItem(_storageKey(), JSON.stringify(hist)); } catch {}
}
function _ranksFromOrder(pilots) {
  const map = {};
  pilots.forEach((p, i) => { if (p && p.name) map[p.name] = i + 1; });
  return map;
}
function _ageDays(iso) { return (Date.now() - new Date(iso).getTime()) / 86400000; }

// ---- Zustand ------------------------------------------------------
let _deltaMap = new Map();
let _climber = null;

/** Deltas gegen Baseline berechnen. VOR dem Rendern aufrufen. */
export function prepare(pilots) {
  const current = _ranksFromOrder(pilots);
  const baseline = _getBaselineRanks();
  const trend = _getTrendRanks();

  _deltaMap = new Map();
  pilots.forEach((p) => {
    const name = p.name;
    const cur = current[name];
    const prev = baseline ? baseline[name] : undefined;
    const isNew = baseline != null && prev === undefined;
    const delta = (prev === undefined) ? 0 : (prev - cur);
    _deltaMap.set(name, {
      name,
      currentRank: cur,
      previousRank: prev === undefined ? null : prev,
      delta,
      isNew,
      momentum: _momentum(cur, prev, trend ? trend[name] : undefined),
    });
  });
  _climber = _computeClimber();
  return _deltaMap;
}

/** Aktuellen Stand lokal sichern. NACH dem Rendern. No-Op bei externem Provider. */
export function commit(pilots) {
  if (_snapshotProvider) return;
  const hist = _loadHistory();
  const last = hist[hist.length - 1];
  if (last && _ageDays(last.t) * 24 < CONFIG.commitMinIntervalHours) return;
  hist.push({ t: new Date().toISOString(), ranks: _ranksFromOrder(pilots) });
  while (hist.length > CONFIG.maxHistory) hist.shift();
  _saveHistory(hist);
}

function _getBaselineRanks() {
  if (_snapshotProvider) {
    try { return _snapshotProvider(CONFIG.baselineAgeDays) || null; } catch { return null; }
  }
  const hist = _loadHistory();
  if (!hist.length) return null;
  const eligible = hist.filter(s => _ageDays(s.t) >= CONFIG.baselineMinAgeDays);
  if (!eligible.length) return null;
  eligible.sort((a, b) =>
    Math.abs(_ageDays(a.t) - CONFIG.baselineAgeDays) -
    Math.abs(_ageDays(b.t) - CONFIG.baselineAgeDays));
  return eligible[0].ranks;
}

function _getTrendRanks() {
  const target = 2 * CONFIG.baselineAgeDays;
  if (_snapshotProvider) {
    try { return _snapshotProvider(target) || null; } catch { return null; }
  }
  const hist = _loadHistory();
  if (hist.length < 2) return null;
  const older = hist.filter(s => _ageDays(s.t) >= CONFIG.baselineAgeDays + 1);
  if (!older.length) return null;
  older.sort((a, b) => Math.abs(_ageDays(a.t) - target) - Math.abs(_ageDays(b.t) - target));
  return older[0].ranks;
}

function _momentum(cur, prevWeek, prevTrend) {
  if (prevWeek === undefined) return 'flat';
  const weekDelta = prevWeek - cur;
  const trendDelta = prevTrend === undefined ? 0 : prevTrend - cur;
  if (weekDelta >= 1 && trendDelta >= 2) return 'hot';
  if (weekDelta >= 1) return 'up';
  if (weekDelta <= -1 && trendDelta <= -2) return 'cold';
  if (weekDelta <= -1) return 'down';
  return 'flat';
}

function _computeClimber() {
  let best = null;
  _deltaMap.forEach((d) => {
    if (d.delta <= 0) return;
    if (!best || d.delta > best.delta ||
        (d.delta === best.delta && d.currentRank < best.currentRank)) best = d;
  });
  return best;
}

export function climberOfWeek() { return _climber; }

// ---- Rendering ----------------------------------------------------
export function badgeHTML(info) {
  if (!info) return '';
  if (info.isNew)
    return `<span class="rd-badge rd-new" title="Neu in der Wertung">NEU</span>`;
  if (info.delta > 0)
    return `<span class="rd-badge rd-up" title="${info.delta} Plätze gut gemacht (war #${info.previousRank})">▲${info.delta}</span>`;
  if (info.delta < 0)
    return `<span class="rd-badge rd-down" title="${-info.delta} Plätze verloren (war #${info.previousRank})">▼${-info.delta}</span>`;
  return ''; // unverändert -> kein Badge (leer, wie im Screenshot)
}

export function momentumHTML(info) {
  if (!info) return '';
  const level = { hot: 3, up: 2, flat: 1, down: 2, cold: 3 }[info.momentum] || 1;
  const cls = (info.momentum === 'flat') ? 'flat'
    : (info.momentum === 'down' || info.momentum === 'cold') ? 'down' : 'up';
  let bars = '';
  for (let i = 1; i <= 3; i++) bars += `<span class="rd-bar ${i <= level ? 'on' : ''}"></span>`;
  const label = { hot: 'stark im Aufwind', up: 'im Aufwind', flat: 'stabil',
                  down: 'nachlassend', cold: 'stark nachlassend' }[info.momentum] || '';
  return `<span class="rd-momentum rd-${cls}" title="${label}">${bars}</span>`;
}

/** FLIP-Animation. Zeilen brauchen data-pilot="<name>". */
export function animateReorder(container, renderFn, opts = {}) {
  if (!container) { renderFn && renderFn(); return; }
  const keyAttr = opts.keyAttr || 'data-pilot';
  const duration = opts.duration || CONFIG.animationDuration;
  const reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const first = new Map();
  container.querySelectorAll('[' + keyAttr + ']').forEach((el) => {
    first.set(el.getAttribute(keyAttr), el.getBoundingClientRect());
  });

  renderFn && renderFn();
  if (reduce) return;

  container.querySelectorAll('[' + keyAttr + ']').forEach((el) => {
    const key = el.getAttribute(keyAttr);
    const prev = first.get(key);
    if (!prev) {
      el.animate([{ opacity: 0, transform: 'translateY(-10px)' },
                  { opacity: 1, transform: 'none' }],
                 { duration, easing: 'ease-out' });
      return;
    }
    const now = el.getBoundingClientRect();
    const dy = prev.top - now.top;
    if (Math.abs(dy) > 0.5) {
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
                 { duration, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  });
}

export function setSnapshotProvider(fn) { _snapshotProvider = fn; }
export function configure(patch) { Object.assign(CONFIG, patch || {}); }

/**
 * loadSharedSnapshots(opts): lädt die geteilten Snapshots und richtet
 * den Provider ein. Wählt den Vergleichsstand nach KALENDERTAG.
 *   opts.daysBack : wie viele Tage zurück verglichen wird (1 = gestern)
 *   opts.url      : optional abweichender JSON-Pfad
 * Rückwärtskompatibel: loadSharedSnapshots('/pfad.json') geht weiterhin.
 */

export async function loadSharedSnapshots(opts = {}) {
  if (typeof opts === 'string') opts = { url: opts };
  const { url, daysBack } = opts;
  if (Number.isFinite(daysBack)) configure({ baselineAgeDays: daysBack });

  const target = url || `/snapshots/${currentSeasonKey()}.json`;
  let history = [];
  try {
    const res = await fetch(target, { cache: 'no-store' });
    if (res.ok) history = await res.json();
  } catch (_) { /* noch kein Snapshot -> einfach keine Pfeile */ }

  const dayOf = t => new Date(t).toISOString().slice(0, 10);

  setSnapshotProvider(targetAgeDays => {
    if (!Array.isArray(history) || !history.length) return null;
    const back = Math.max(1, Math.round(targetAgeDays)); // Kalendertage zurück
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - back);
    const cutoffDay = cutoff.toISOString().slice(0, 10);
    // neuester Snapshot, der mindestens 'back' Kalendertage alt ist
    const candidates = history
      .filter(s => dayOf(s.t) <= cutoffDay)
      .sort((a, b) => new Date(b.t) - new Date(a.t));
    return candidates.length ? candidates[0].ranks : null;
  });
  return history.length;
}

// ---- CSS einmalig injizieren -------------------------------------
(function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById('rd-styles')) return;
  const css = `
  .rd-badge{display:inline-flex;align-items:center;justify-content:center;
    min-width:2.1em;padding:1px 6px;border-radius:999px;font-weight:700;
    font-size:.8em;line-height:1.5;font-variant-numeric:tabular-nums;letter-spacing:.2px;}
  .rd-up{color:#0a7d2c;background:rgba(16,163,74,.12);}
  .rd-down{color:#c1121f;background:rgba(220,38,38,.12);}
  .rd-same{color:#8a8f98;background:rgba(140,145,155,.12);}
  .rd-new{color:#1d4ed8;background:rgba(37,99,235,.12);font-size:.72em;}
  @keyframes rd-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
  .rd-badge{animation:rd-pop .35s ease-out;}
  .rd-momentum{display:inline-flex;align-items:flex-end;gap:2px;height:12px;margin-left:4px;vertical-align:middle;}
  .rd-bar{width:3px;border-radius:1px;background:#cfd3da;}
  .rd-bar:nth-child(1){height:5px}.rd-bar:nth-child(2){height:8px}.rd-bar:nth-child(3){height:11px}
  .rd-up .rd-bar.on{background:#10a34a;}
  .rd-down .rd-bar.on{background:#dc2626;}
  .rd-flat .rd-bar.on{background:#9aa0aa;}
  @media (prefers-reduced-motion: reduce){.rd-badge{animation:none;}}`;
  const style = document.createElement('style');
  style.id = 'rd-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();

// Bequemer Sammel-Export (optional):
export default {
  prepare, commit, badgeHTML, momentumHTML, animateReorder,
  climberOfWeek, setSnapshotProvider, configure, currentSeasonKey, loadSharedSnapshots,
};
