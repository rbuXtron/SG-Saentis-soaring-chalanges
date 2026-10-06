// chart-generators.js - Einheitliche Statistik-Sprache
// Horizontale Top-N-Rang-Charts (eine Funktion), Streckenflugqualität (Streudiagramm)
// und Saisonverlauf (Balken + km-Linien, ohne Dual-Axis). Theme-fähig: hell / Alpin.

import { formatNumber, formatDateForDisplay } from '../utils/utils.js';

// ---------------------------------------------------------------- Theme
const THEME = {
  light: {
    ink: '#10243a', ink2: '#52607a', muted: '#8a97ad',
    grid: 'rgba(16,36,58,.08)', surface: '#ffffff',
    hours: '#eda100', flights: '#4a3aa7', bestkm: '#008300', sprint: '#eb6834',
    weglide: '#e87ba4', quality: '#2a78d6',
    wkBar: '#2a78d6', longest: '#eda100', avg: '#e87ba4'
  },
  alpine: {
    ink: '#f3f4f6', ink2: '#c3c2b7', muted: '#8b93a1',
    grid: 'rgba(255,255,255,.09)', surface: '#1a1f27',
    hours: '#c98500', flights: '#9085e9', bestkm: '#2faf4f', sprint: '#d95926',
    weglide: '#d55181', quality: '#3987e5',
    wkBar: '#3987e5', longest: '#c98500', avg: '#d55181'
  }
};
function isAlpine() {
  return document.documentElement.getAttribute('data-theme') === 'alpine';
}
function T() { return isAlpine() ? THEME.alpine : THEME.light; }

const TOP_N = 15;

if (window.Chart) {
  try { Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif"; } catch (e) {}
}

// ---------------------------------------------------------------- Saison-Helfer
function getSeasonFromPilots(pilots) {
  if (pilots?.length > 0 && pilots[0].season) return pilots[0].season;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return month >= 10 ? year + 1 : year;
}
function getSeasonString(season) {
  const y = parseInt(season, 10);
  return `${y - 1}/${y}`;
}

// ---------------------------------------------------------------- Rang-Chart (horizontal, Top N)
// EINE Funktion für alle Ranglisten. rows: [{ name, value, lines? }]
function createRankChart(container, cfg) {
  if (!window.Chart) return;
  const t = T();
  const rows = [...cfg.rows].sort((a, b) => b.value - a.value).slice(0, cfg.topN || TOP_N);
  if (!rows.length) {
    container.innerHTML = `<div class="no-data">${cfg.empty || 'Keine Daten'}</div>`;
    return;
  }
  const base = cfg.color;
  const colors = rows.map((_, i) => (i === 0 ? base : base + 'b0')); // #1 voll, Rest leicht zurückgenommen
  const valueLabel = cfg.valueLabel || (v => formatNumber(v));

  // Flex-Container zentriert das Canvas und verschiebt die Hover-Trefferfläche -> Block erzwingen
  container.style.display = 'block';
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  // Werte am Balkenende (direkte Labels — zugleich Kontrast-Relief)
  const barValue = {
    id: 'barValue',
    afterDatasetsDraw(c) {
      const meta = c.getDatasetMeta(0), ctx = c.ctx;
      ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      meta.data.forEach((bar, i) => {
        ctx.fillStyle = i === 0 ? t.ink : t.ink2;
        ctx.font = (i === 0 ? '700' : '500') + " 12px 'IBM Plex Sans', system-ui, sans-serif";
        ctx.fillText(valueLabel(rows[i].value, rows[i]), bar.x + 8, bar.y);
      });
      ctx.restore();
    }
  };

  new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
      datasets: [{
        data: rows.map(r => r.value),
        backgroundColor: colors, hoverBackgroundColor: base,
        borderWidth: 0, borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 72, left: 4, top: 4, bottom: 4 } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: cfg.title, color: t.ink, font: { size: 15, weight: 'bold' }, padding: { top: 2, bottom: 14 } },
        tooltip: {
          backgroundColor: t.ink, titleColor: t.surface, bodyColor: t.surface,
          padding: 10, cornerRadius: 8, displayColors: false,
          callbacks: {
            title: items => rows[items[0].dataIndex].name,
            label: ctx => (cfg.tooltip ? cfg.tooltip(rows[ctx.dataIndex]) : ' ' + valueLabel(ctx.parsed.x, rows[ctx.dataIndex]))
          }
        }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: t.grid }, ticks: { color: t.muted, maxTicksLimit: 4, callback: v => formatNumber(v) } },
        y: { grid: { display: false }, ticks: { color: t.ink2, font: { size: 12 } } }
      }
    },
    plugins: [barValue]
  });
}

// ---------------------------------------------------------------- Ranglisten
export function renderPointsChart(pilots, containerId = 'points-chart') {
  const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
  const s = getSeasonString(getSeasonFromPilots(pilots));
  const rows = (pilots || []).filter(p => (p.totalPoints || 0) > 0).map(p => {
    const km = (p.flights || []).reduce((sum, f) => sum + (f.km || 0), 0);
    return { name: p.name, value: p.totalPoints, lines: [`${formatNumber(p.totalPoints.toFixed(2))} Punkte`, `Gesamt-km: ${formatNumber(km.toFixed(1))} km`, `Pilotenfaktor: ${p.pilotFactor}`] };
  });
  createRankChart(c, { rows, color: T().quality, title: `SG Säntis Cup – Gesamtpunkte ${s}`, empty: `Keine Punkte für Saison ${s}`, valueLabel: v => formatNumber(Math.round(v)), tooltip: r => r.lines });
}

export function renderTotalKmChart(pilots, containerId = 'total-km-chart') {
  const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
  const s = getSeasonString(getSeasonFromPilots(pilots));
  const rows = (pilots || []).filter(p => p.allFlights?.length > 0).map(p => {
    const km = p.allFlights.reduce((sum, f) => sum + (f.km || 0), 0);
    const n = p.allFlights.length;
    return { name: p.name, value: km, lines: [`${formatNumber(km.toFixed(1))} km`, `${n} Flüge`, `Ø ${formatNumber((km / n).toFixed(1))} km/Flug`] };
  }).filter(r => r.value > 0);
  createRankChart(c, { rows, color: T().bestkm, title: `Gesamt-Kilometer ${s}`, empty: `Keine Kilometer-Daten für Saison ${s}`, valueLabel: v => formatNumber(Math.round(v)) + ' km', tooltip: r => r.lines });
}

export function renderTotalHoursChart(pilots, containerId = 'total-hours-chart') {
  const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
  const s = getSeasonString(getSeasonFromPilots(pilots));
  const rows = (pilots || []).filter(p => p.allFlights?.length > 0).map(p => {
    let mins = 0; p.allFlights.forEach(f => { if (f.duration) mins += f.duration / 60; });
    const hours = mins / 60, n = p.allFlights.length;
    const h = Math.floor(hours), m = Math.round((hours - h) * 60);
    return { name: p.name, value: hours, lines: [`${h}h ${m}min`, `${n} Flüge`, `Ø ${Math.round(mins / n)} min/Flug`] };
  }).filter(r => r.value > 0);
  createRankChart(c, { rows, color: T().hours, title: `Gesamt-Flugstunden ${s}`, empty: `Keine Flugstunden-Daten für Saison ${s}`, valueLabel: v => Math.round(v) + ' h', tooltip: r => r.lines });
}

export function renderFlightsPerPilotChart(pilots, containerId = 'flights-per-pilot-chart') {
  const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
  const s = getSeasonString(getSeasonFromPilots(pilots));
  const rows = (pilots || []).filter(p => p.allFlights?.length > 0).map(p => {
    const km = p.allFlights.reduce((sum, f) => sum + (f.km || 0), 0);
    return { name: p.name, value: p.allFlights.length, lines: [`${p.allFlights.length} Flüge`, `Gesamt: ${formatNumber(km.toFixed(1))} km`] };
  });
  createRankChart(c, { rows, color: T().flights, title: `Anzahl Flüge ${s}`, empty: `Keine Flugdaten für Saison ${s}`, valueLabel: v => formatNumber(v), tooltip: r => r.lines });
}

export function renderTopKmChart(pilots, containerId = 'km-chart') {
  const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
  const s = getSeasonString(getSeasonFromPilots(pilots));
  const best = new Map();
  (pilots || []).forEach(p => {
    (p.flights || []).forEach(f => {
      const cur = best.get(p.name);
      if (!cur || f.km > cur.km) best.set(p.name, { ...f, pilotName: p.name });
    });
  });
  const rows = Array.from(best.values()).map(f => ({
    name: f.pilotName, value: f.km,
    lines: [`${formatNumber(f.km.toFixed(1))} km`, f.aircraftType ? `Flugzeug: ${f.aircraftType}` : '', f.date ? `Datum: ${formatDateForDisplay(f.date)}` : ''].filter(Boolean)
  }));
  createRankChart(c, { rows, color: T().bestkm, title: `Beste Kilometer aller Piloten ${s}`, empty: `Keine Daten für Saison ${s}`, valueLabel: v => formatNumber(Math.round(v)) + ' km', tooltip: r => r.lines });
}

export function renderTopSpeedChart(pilots, containerId = 'top-speed-chart') {
  const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
  const s = getSeasonString(getSeasonFromPilots(pilots));
  const withSprints = (pilots || []).filter(p => p.sprintData?.length > 0);
  if (!withSprints.length) {
    c.innerHTML = `<div class="no-data"><p>Keine Sprint-Daten für Saison ${s} vorhanden</p><p style="font-size:12px;color:#999;">Sprint-Wertungen werden für Flüge über 100km vergeben</p></div>`;
    return;
  }
  const best = new Map();
  withSprints.forEach(p => {
    p.sprintData.forEach(sp => {
      if (!sp?.contest) return;
      const d = { pilotName: p.name, points: sp.contest.points || 0, speed: sp.contest.speed || 0, distance: sp.contest.distance || 0, date: sp.scoring_date || sp.takeoff_time };
      const cur = best.get(p.name);
      if (!cur || d.points > cur.points) best.set(p.name, d);
    });
  });
  const rows = Array.from(best.values()).map(sp => ({
    name: sp.pilotName, value: sp.points,
    lines: [`${sp.points.toFixed(1)} Punkte`, `Geschwindigkeit: ${sp.speed.toFixed(1)} km/h`, `Distanz: ${sp.distance.toFixed(1)} km`, `Datum: ${formatDateForDisplay(sp.date)}`]
  }));
  createRankChart(c, { rows, color: T().sprint, title: `Top Sprint-Wertungen ${s}`, empty: `Keine Sprint-Daten für Saison ${s}`, valueLabel: v => formatNumber(Math.round(v)), tooltip: r => r.lines });
}

export function renderWeGlidePointsChart(pilots, containerId = 'weglide-points-chart') {
  const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
  const s = getSeasonString(getSeasonFromPilots(pilots));
  const rows = (pilots || []).map(p => {
    const sorted = [...(p.allFlights || [])].sort((a, b) => (b.originalPoints || 0) - (a.originalPoints || 0));
    const bestF = sorted.slice(0, 6);
    const pts = bestF.reduce((sum, f) => sum + (f.originalPoints || 0), 0);
    const km = bestF.reduce((sum, f) => sum + (f.km || 0), 0);
    return pts > 0 ? { name: p.name, value: Math.round(pts), lines: [`${formatNumber(Math.round(pts))} Punkte`, `Gesamt-km: ${formatNumber(km.toFixed(1))} km`, `${bestF.length} Flüge gewertet`] } : null;
  }).filter(Boolean);
  createRankChart(c, { rows, color: T().weglide, title: `WeGlide-Punkte – Beste 6 Flüge ${s}`, empty: `Keine WeGlide-Punkte für Saison ${s}`, valueLabel: v => formatNumber(Math.round(v)), tooltip: r => r.lines });
}

// ---------------------------------------------------------------- Streckenflugqualität (Streudiagramm)
export function renderQualityChart(pilots, containerId = 'quality-chart') {
  const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
  if (!window.Chart) return;
  const t = T();
  const s = getSeasonString(getSeasonFromPilots(pilots));

  const data = (pilots || []).filter(p => p.allFlights?.length > 0).map(p => {
    const fls = p.allFlights, n = fls.length;
    const totalKm = fls.reduce((sum, f) => sum + (f.km || 0), 0);
    const speeds = fls.map(f => f.speed || 0).filter(v => v > 0);
    const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const avgKm = n ? totalKm / n : 0;
    return { name: p.name, avgKm, avgSpeed, count: n };
  }).filter(p => p.avgKm > 0 && p.avgSpeed > 0);

  if (!data.length) {
    c.innerHTML = `<div class="no-data">Keine Qualitätsdaten für Saison ${s}</div>`;
    return;
  }

  // Block erzwingen: Flex-Zentrierung verschiebt sonst die Hover-Trefferfläche
  c.style.display = 'block';
  const canvas = document.createElement('canvas');
  c.appendChild(canvas);
  const acc = t.quality;

  // Nachname neben jeder Blase
  const bubbleLabels = {
    id: 'bubbleLabels',
    afterDatasetsDraw(ch) {
      const meta = ch.getDatasetMeta(0), ctx = ch.ctx; ctx.save();
      ctx.font = "600 10px 'IBM Plex Sans', system-ui, sans-serif"; ctx.fillStyle = t.ink2; ctx.textBaseline = 'middle';
      meta.data.forEach((pt, i) => {
        const last = data[i].name.split(' ').slice(-1)[0];
        const r = (pt.options && pt.options.radius) || 6;
        let x = pt.x + r + 4, align = 'left';
        if (x + 48 > ch.chartArea.right) { x = pt.x - r - 4; align = 'right'; }
        ctx.textAlign = align; ctx.fillText(last, x, pt.y);
      });
      ctx.restore();
    }
  };

  new Chart(canvas.getContext('2d'), {
    type: 'bubble',
    data: {
      datasets: [{
        data: data.map(p => ({ x: p.avgKm, y: p.avgSpeed, r: Math.max(5, Math.sqrt(p.count) * 1.7) })),
        backgroundColor: acc + '59', borderColor: acc, borderWidth: 1.5, hoverBackgroundColor: acc
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      hover: { mode: 'nearest', intersect: false },
      layout: { padding: { top: 6, right: 18, left: 4, bottom: 2 } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: `Streckenflugqualität ${s} – weit & schnell`, color: t.ink, font: { size: 15, weight: 'bold' }, padding: { top: 2, bottom: 12 } },
        tooltip: {
          backgroundColor: t.ink, titleColor: t.surface, bodyColor: t.surface, padding: 10, cornerRadius: 8, displayColors: false,
          callbacks: {
            title: items => data[items[0].dataIndex].name,
            label: ctx => { const p = data[ctx.dataIndex]; return [`Ø ${formatNumber(Math.round(p.avgKm))} km pro Flug`, `Ø ${formatNumber(Math.round(p.avgSpeed))} km/h`, `${p.count} Flüge`]; }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Ø Strecke pro Flug (km)', color: t.muted, font: { size: 11.5 } }, grid: { color: t.grid }, ticks: { color: t.muted, maxTicksLimit: 6 } },
        y: { title: { display: true, text: 'Ø Geschwindigkeit (km/h)', color: t.muted, font: { size: 11.5 } }, grid: { color: t.grid }, ticks: { color: t.muted, maxTicksLimit: 6 } }
      }
    },
    plugins: [bubbleLabels]
  });
}

// ---------------------------------------------------------------- Saisonverlauf (Balken + km-Linien)
export function renderMonthlyProgressChart(pilots, containerId = 'monthly-progress-chart') {
  const container = document.getElementById(containerId); if (!container) return;
  container.innerHTML = '';
  if (!window.Chart) return;
  const t = T();
  const s = getSeasonString(getSeasonFromPilots(pilots));

  const weekly = {};
  (pilots || []).forEach(p => {
    p.allFlights?.forEach(f => {
      const date = new Date(f.date);
      const key = getWeekKey(date);
      if (!weekly[key]) weekly[key] = { week: getWeekNumber(date), year: date.getFullYear(), flights: 0, totalKm: 0, maxKm: 0, pilots: new Set() };
      weekly[key].flights++;
      weekly[key].totalKm += f.km || 0;
      weekly[key].maxKm = Math.max(weekly[key].maxKm, f.km || 0);
      weekly[key].pilots.add(p.name);
    });
  });
  const weeks = Object.keys(weekly).sort();
  if (!weeks.length) { container.innerHTML = `<div class="no-data">Keine Daten für Saisonverlauf ${s}</div>`; return; }

  const labels = weeks.map(w => `${weekly[w].week}/${String(weekly[w].year).slice(-2)}`);
  const flights = weeks.map(w => weekly[w].flights);
  const avgKm = weeks.map(w => (weekly[w].flights > 0 ? weekly[w].totalKm / weekly[w].flights : 0));
  const maxKm = weeks.map(w => weekly[w].maxKm);
  const activePilots = weeks.map(w => weekly[w].pilots.size);
  const iPeak = flights.indexOf(Math.max(...flights));
  const yWidth = sc => { sc.width = 46; };

  // zwei gestapelte Canvases in denselben Container (eine gemeinsame Zeitachse)
  // Block + auto-Höhe: der Flex-Container würde die Canvas sonst auf 0 Breite kollabieren
  container.style.display = 'block';
  container.style.height = 'auto';
  const box1 = document.createElement('div'); box1.style.cssText = 'position:relative;height:190px';
  const box2 = document.createElement('div'); box2.style.cssText = 'position:relative;height:250px;margin-top:8px';
  const cv1 = document.createElement('canvas'); box1.appendChild(cv1);
  const cv2 = document.createElement('canvas'); box2.appendChild(cv2);
  container.appendChild(box1); container.appendChild(box2);

  // Balken: Anzahl Flüge, Spitzenwoche beschriftet
  const peakLabel = {
    id: 'peakLabel',
    afterDatasetsDraw(ch) {
      const bar = ch.getDatasetMeta(0).data[iPeak]; if (!bar) return; const ctx = ch.ctx; ctx.save();
      ctx.fillStyle = t.ink; ctx.textAlign = 'center'; ctx.font = "700 13px 'IBM Plex Sans', system-ui, sans-serif";
      ctx.fillText(flights[iPeak], bar.x, bar.y - 16);
      ctx.fillStyle = t.muted; ctx.font = "600 10px 'IBM Plex Sans', system-ui, sans-serif";
      ctx.fillText('KW ' + labels[iPeak].split('/')[0], bar.x, bar.y - 5); ctx.restore();
    }
  };
  new Chart(cv1.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Anzahl Flüge', data: flights, backgroundColor: t.wkBar, borderRadius: 4, categoryPercentage: 0.78, barPercentage: 0.92 }] },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 26, right: 30 } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: `Anzahl Flüge pro Woche – Saison ${s}`, color: t.ink, font: { size: 15, weight: 'bold' }, padding: { top: 2, bottom: 10 } },
        tooltip: {
          mode: 'index', intersect: false, backgroundColor: t.ink, titleColor: t.surface, bodyColor: t.surface, padding: 10, cornerRadius: 8, displayColors: false,
          callbacks: { title: it => 'KW ' + labels[it[0].dataIndex], label: it => ` ${it.parsed.y} Flüge`, afterLabel: it => `Aktive Piloten: ${activePilots[it.dataIndex]}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { display: false } },
        y: { beginAtZero: true, grid: { color: t.grid }, ticks: { color: t.ink2, maxTicksLimit: 5 }, afterFit: yWidth }
      }
    },
    plugins: [peakLabel]
  });

  // Linien: Längster (durchgezogen) + Ø Strecke (gestrichelt), eine km-Achse
  const endLabels = {
    id: 'endLabels',
    afterDatasetsDraw(ch) {
      const ctx = ch.ctx;
      const items = ch.data.datasets.map((ds, di) => {
        const m = ch.getDatasetMeta(di), pt = m.data[m.data.length - 1];
        return pt ? { ds, x: Math.min(pt.x + 8, ch.chartArea.right + 6), y: pt.y } : null;
      }).filter(Boolean);
      const gap = 15; items.sort((a, b) => a.y - b.y);
      for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
      const over = items.length ? items[items.length - 1].y - (ch.chartArea.bottom - 4) : 0;
      if (over > 0) items.forEach(it => it.y -= over);
      ctx.save();
      items.forEach(it => {
        ctx.strokeStyle = it.ds.borderColor; ctx.lineWidth = 2.5;
        ctx.setLineDash(it.ds.borderDash && it.ds.borderDash.length ? it.ds.borderDash : []);
        ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(it.x + 14, it.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = t.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = "600 11px 'IBM Plex Sans', system-ui, sans-serif"; ctx.fillText(it.ds.label, it.x + 18, it.y);
      });
      ctx.restore();
    }
  };
  new Chart(cv2.getContext('2d'), {
    type: 'line',
    data: {
      labels, datasets: [
        { label: 'Längster', data: maxKm, borderColor: t.longest, backgroundColor: 'transparent', borderWidth: 2.5, tension: 0.35, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: t.longest },
        { label: 'Ø Strecke', data: avgKm, borderColor: t.avg, backgroundColor: 'transparent', borderWidth: 2, borderDash: [5, 4], tension: 0.35, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: t.avg }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 8, right: 84 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', align: 'end', labels: { color: t.ink2, usePointStyle: true, pointStyle: 'line', boxWidth: 24, padding: 16 } },
        title: { display: true, text: `Streckenleistung pro Woche – Kilometer`, color: t.ink, font: { size: 15, weight: 'bold' }, padding: { top: 2, bottom: 8 } },
        tooltip: {
          mode: 'index', intersect: false, backgroundColor: t.ink, titleColor: t.surface, bodyColor: t.surface, padding: 10, cornerRadius: 8, usePointStyle: true, boxWidth: 9, boxHeight: 9,
          callbacks: { title: it => 'KW ' + labels[it[0].dataIndex], label: it => ` ${it.dataset.label}: ${Math.round(it.parsed.y)} km` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: t.ink2, maxRotation: 0, autoSkip: false, callback: (v, i) => (i % 3 === 0 ? labels[i].split('/')[0] : '') } },
        y: { beginAtZero: true, grid: { color: t.grid }, ticks: { color: t.ink2, maxTicksLimit: 5 }, afterFit: yWidth }
      }
    },
    plugins: [endLabels]
  });
}

// ---------------------------------------------------------------- Wochennummer-Helfer
function getWeekNumber(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
function getWeekKey(date) {
  return `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- Alle Charts
let _lastPilots = null;

export function renderAllCharts(pilots) {
  _lastPilots = pilots;
  renderTotalHoursChart(pilots);
  renderFlightsPerPilotChart(pilots);
  renderTopKmChart(pilots);
  renderTopSpeedChart(pilots);
  renderWeGlidePointsChart(pilots);
  renderQualityChart(pilots);
  renderMonthlyProgressChart(pilots);
}

// Beim Theme-Wechsel (hell <-> Alpin) die Charts neu zeichnen, damit Farben mitziehen.
if (typeof MutationObserver !== 'undefined') {
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.attributeName === 'data-theme') { if (_lastPilots) renderAllCharts(_lastPilots); break; }
    }
  });
  try { mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}
}
