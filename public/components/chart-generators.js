// chart-generators.js - Bereinigt mit einheitlichem Farbschema

import { formatNumber, formatDateForDisplay } from '../utils/utils.js';
import { APP_CONFIG } from '../config/constants.js';

// Einheitliches Farbschema für alle Charts
const CHART_COLORS = {
  primary: 'rgba(54, 162, 235, 0.7)',      // Blau
  secondary: 'rgba(255, 99, 132, 0.7)',     // Rot
  tertiary: 'rgba(75, 192, 192, 0.7)',      // Türkis
  quaternary: 'rgba(255, 206, 86, 0.7)',    // Gelb
  quinary: 'rgba(153, 102, 255, 0.7)',      // Violett
  senary: 'rgba(255, 159, 64, 0.7)',        // Orange
  septenary: 'rgba(46, 204, 113, 0.7)',     // Grün
  octonary: 'rgba(231, 76, 60, 0.7)'        // Dunkelrot
};

// Standard Chart-Optionen
const DEFAULT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: {
      display: true,
      font: { size: 16, weight: 'bold' },
      padding: 20
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(0, 0, 0, 0.05)' }
    },
    x: {
      grid: { display: false }
    }
  }
};

// Hilfsfunktion: Saison aus Pilotdaten
function getSeasonFromPilots(pilots) {
  if (pilots?.length > 0 && pilots[0].season) {
    return pilots[0].season;
  }
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return month >= 10 ? year + 1 : year;
}

function getSeasonString(season) {
  return season === 2026 ? '2025/2026' : '2024/2025';
}

/**
 * Rendert Gesamtpunkte Chart
 */
export function renderPointsChart(pilots, containerId = 'points-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  chartContainer.innerHTML = '';
  const seasonString = getSeasonString(getSeasonFromPilots(pilots));

  if (!pilots?.length) {
    chartContainer.innerHTML = `<div class="no-data">Keine Daten für Saison ${seasonString}</div>`;
    return;
  }

  const sortedPilots = [...pilots].sort((a, b) => b.totalPoints - a.totalPoints);

  createBarChart(chartContainer, {
    labels: sortedPilots.map(p => p.name),
    data: sortedPilots.map(p => p.totalPoints),
    label: 'Gesamtpunkte',
    title: `SG Säntis Cup - Gesamtpunkte Saison ${seasonString}`,
    color: CHART_COLORS.primary,
    tooltipCallback: (context) => {
      const pilot = sortedPilots[context.dataIndex];
      const km = pilot.flights.reduce((sum, f) => sum + (f.km || 0), 0);
      return [
        `${formatNumber(pilot.totalPoints.toFixed(2))} Punkte`,
        `Gesamt-km: ${formatNumber(km.toFixed(1))} km`,
        `Pilotenfaktor: ${pilot.pilotFactor}`
      ];
    }
  });
}

/**
 * Rendert Gesamt-Kilometer Chart
 */
export function renderTotalKmChart(pilots, containerId = 'total-km-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  chartContainer.innerHTML = '';
  const seasonString = getSeasonString(getSeasonFromPilots(pilots));

  const pilotKmData = pilots
    .filter(p => p.allFlights?.length > 0)
    .map(pilot => ({
      name: pilot.name,
      totalKm: pilot.allFlights.reduce((sum, f) => sum + (f.km || 0), 0),
      flightCount: pilot.allFlights.length
    }))
    .filter(p => p.totalKm > 0)
    .sort((a, b) => b.totalKm - a.totalKm);

  if (!pilotKmData.length) {
    chartContainer.innerHTML = `<div class="no-data">Keine Kilometer-Daten für Saison ${seasonString}</div>`;
    return;
  }

  createBarChart(chartContainer, {
    labels: pilotKmData.map(p => p.name),
    data: pilotKmData.map(p => p.totalKm),
    label: 'Kilometer',
    title: `Gesamt-Kilometer - Saison ${seasonString}`,
    color: CHART_COLORS.tertiary,
    tooltipCallback: (context) => {
      const pilot = pilotKmData[context.dataIndex];
      return [
        `${formatNumber(pilot.totalKm.toFixed(1))} km`,
        `${pilot.flightCount} Flüge`,
        `Ø ${formatNumber((pilot.totalKm / pilot.flightCount).toFixed(1))} km/Flug`
      ];
    }
  });
}

/**
 * Rendert Flugstunden Chart
 */
export function renderTotalHoursChart(pilots, containerId = 'total-hours-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  chartContainer.innerHTML = '';
  const seasonString = getSeasonString(getSeasonFromPilots(pilots));

  const pilotHoursData = pilots
    .filter(p => p.allFlights?.length > 0)
    .map(pilot => {
      let totalMinutes = 0;
      pilot.allFlights.forEach(flight => {
        if (flight.duration) {
          totalMinutes += (flight.duration / 60);
        }
      });
      return {
        name: pilot.name,
        totalHours: totalMinutes / 60,
        totalMinutes,
        flightCount: pilot.allFlights.length
      };
    })
    .filter(p => p.totalHours > 0)
    .sort((a, b) => b.totalHours - a.totalHours);

  if (!pilotHoursData.length) {
    chartContainer.innerHTML = `<div class="no-data">Keine Flugstunden-Daten für Saison ${seasonString}</div>`;
    return;
  }

  createBarChart(chartContainer, {
    labels: pilotHoursData.map(p => p.name),
    data: pilotHoursData.map(p => p.totalHours),
    label: 'Stunden',
    title: `Gesamt-Flugstunden - Saison ${seasonString}`,
    color: CHART_COLORS.quaternary,
    yAxisTitle: 'Stunden',
    tooltipCallback: (context) => {
      const pilot = pilotHoursData[context.dataIndex];
      const hours = Math.floor(pilot.totalHours);
      const minutes = Math.round((pilot.totalHours - hours) * 60);
      return [
        `${hours}h ${minutes}min`,
        `${pilot.flightCount} Flüge`,
        `Ø ${Math.round(pilot.totalMinutes / pilot.flightCount)} min/Flug`
      ];
    }
  });
}

/**
 * Rendert Anzahl Flüge Chart
 */
export function renderFlightsPerPilotChart(pilots, containerId = 'flights-per-pilot-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  chartContainer.innerHTML = '';
  const seasonString = getSeasonString(getSeasonFromPilots(pilots));

  const pilotFlightData = pilots
    .filter(p => p.allFlights?.length > 0)
    .map(pilot => ({
      name: pilot.name,
      flightCount: pilot.allFlights.length,
      totalKm: pilot.allFlights.reduce((sum, f) => sum + (f.km || 0), 0)
    }))
    .sort((a, b) => b.flightCount - a.flightCount);

  if (!pilotFlightData.length) {
    chartContainer.innerHTML = `<div class="no-data">Keine Flugdaten für Saison ${seasonString}</div>`;
    return;
  }

  createBarChart(chartContainer, {
    labels: pilotFlightData.map(p => p.name),
    data: pilotFlightData.map(p => p.flightCount),
    label: 'Anzahl Flüge',
    title: `Anzahl Flüge - Saison ${seasonString}`,
    color: CHART_COLORS.quinary,
    tooltipCallback: (context) => {
      const pilot = pilotFlightData[context.dataIndex];
      return [
        `${pilot.flightCount} Flüge`,
        `Gesamt: ${formatNumber(pilot.totalKm.toFixed(1))} km`
      ];
    }
  });
}

/**
 * Rendert Top Kilometer Chart
 */
export function renderTopKmChart(pilots, containerId = 'km-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  chartContainer.innerHTML = '';
  const seasonString = getSeasonString(getSeasonFromPilots(pilots));

  // Sammle beste Flüge pro Pilot
  const bestFlightsByPilot = new Map();
  pilots.forEach(pilot => {
    pilot.flights?.forEach(flight => {
      const current = bestFlightsByPilot.get(pilot.name);
      if (!current || flight.km > current.km) {
        bestFlightsByPilot.set(pilot.name, { ...flight, pilotName: pilot.name });
      }
    });
  });

  // ÄNDERUNG: Zeige ALLE Piloten statt nur Top 15
  const allBestFlights = Array.from(bestFlightsByPilot.values())
    .sort((a, b) => b.km - a.km);

  if (!allBestFlights.length) {
    chartContainer.innerHTML = `<div class="no-data">Keine Daten für Saison ${seasonString}</div>`;
    return;
  }

  createBarChart(chartContainer, {
    labels: allBestFlights.map(f => f.pilotName),
    data: allBestFlights.map(f => f.km),
    label: 'Beste Distanz (km)',
    title: `Beste Kilometer aller Piloten - Saison ${seasonString}`,
    color: CHART_COLORS.septenary,
    tooltipCallback: (context) => {
      const flight = allBestFlights[context.dataIndex];
      return [
        `${formatNumber(flight.km.toFixed(1))} km`,
        flight.aircraftType ? `Flugzeug: ${flight.aircraftType}` : '',
        flight.date ? `Datum: ${formatDateForDisplay(flight.date)}` : ''
      ].filter(Boolean);
    }
  });
}

/**
 * Rendert WeGlide Punkte Chart
 */
export function renderWeGlidePointsChart(pilots, containerId = 'weglide-points-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  chartContainer.innerHTML = '';
  const seasonString = getSeasonString(getSeasonFromPilots(pilots));

  const pilotPointsData = pilots
    .map(pilot => {
      const sortedFlights = [...(pilot.allFlights || [])]
        .sort((a, b) => (b.originalPoints || 0) - (a.originalPoints || 0));
      const bestFlights = sortedFlights.slice(0, 6);
      const totalPoints = bestFlights.reduce((sum, f) => sum + (f.originalPoints || 0), 0);
      const totalKm = bestFlights.reduce((sum, f) => sum + (f.km || 0), 0);

      return totalPoints > 0 ? {
        name: pilot.name,
        totalWeGlidePoints: Math.round(totalPoints),
        flightCount: bestFlights.length,
        totalKm
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.totalWeGlidePoints - a.totalWeGlidePoints);

  if (!pilotPointsData.length) {
    chartContainer.innerHTML = `<div class="no-data">Keine WeGlide-Punkte für Saison ${seasonString}</div>`;
    return;
  }

  createBarChart(chartContainer, {
    labels: pilotPointsData.map(p => p.name),
    data: pilotPointsData.map(p => p.totalWeGlidePoints),
    label: 'WeGlide Punkte',
    title: `WeGlide Punkte - Beste 6 Flüge Saison ${seasonString}`,
    color: CHART_COLORS.secondary,
    tooltipCallback: (context) => {
      const pilot = pilotPointsData[context.dataIndex];
      return [
        `${formatNumber(pilot.totalWeGlidePoints)} Punkte`,
        `Gesamt-km: ${formatNumber(pilot.totalKm.toFixed(1))} km`,
        `${pilot.flightCount} Flüge gewertet`
      ];
    }
  });
}

/**
 * Hilfsfunktion: Erstellt einheitliche Bar Charts
 */
function createBarChart(container, config) {
  if (!window.Chart) return;

  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: config.labels,
      datasets: [{
        label: config.label,
        data: config.data,
        backgroundColor: config.color,
        borderColor: config.color.replace('0.7', '1'),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      ...DEFAULT_OPTIONS,
      plugins: {
        ...DEFAULT_OPTIONS.plugins,
        title: {
          ...DEFAULT_OPTIONS.plugins.title,
          text: config.title
        },
        tooltip: config.tooltipCallback ? {
          callbacks: {
            label: config.tooltipCallback
          }
        } : undefined
      },
      scales: {
        ...DEFAULT_OPTIONS.scales,
        y: {
          ...DEFAULT_OPTIONS.scales.y,
          title: config.yAxisTitle ? {
            display: true,
            text: config.yAxisTitle
          } : undefined
        }
      }
    }
  });
}

/**
 * Rendert Sprint/Geschwindigkeits-Chart
 */
export function renderTopSpeedChart(pilots, containerId = 'top-speed-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  console.log('📊 Rendere Top Speed Chart...');
  console.log(`👨‍✈️ Anzahl Piloten: ${pilots.length}`);

  chartContainer.innerHTML = '';
  const seasonString = getSeasonString(getSeasonFromPilots(pilots));

  const pilotsWithSprints = pilots.filter(p => p.sprintData?.length > 0);

  if (!pilotsWithSprints.length) {
    chartContainer.innerHTML = `
            <div class="no-data">
                <p>Keine Sprint-Daten für Saison ${seasonString} vorhanden</p>
                <p style="font-size: 12px; color: #999;">Sprint-Wertungen werden für Flüge über 100km vergeben</p>
            </div>`;
    return;
  }

  // Sammle beste Sprints pro Pilot
  const bestSprintsByPilot = new Map();
  pilotsWithSprints.forEach(pilot => {
    pilot.sprintData.forEach(sprint => {
      if (!sprint?.contest) return;

      const sprintData = {
        pilotName: pilot.name,
        points: sprint.contest.points || 0,
        speed: sprint.contest.speed || 0,
        distance: sprint.contest.distance || 0,
        date: sprint.scoring_date || sprint.takeoff_time
      };

      const current = bestSprintsByPilot.get(pilot.name);
      if (!current || sprintData.points > current.points) {
        bestSprintsByPilot.set(pilot.name, sprintData);
      }
    });
  });

  const topSprints = Array.from(bestSprintsByPilot.values())
    .sort((a, b) => b.points - a.points)
    .slice(0, 15);

  if (!topSprints.length) return;

  createBarChart(chartContainer, {
    labels: topSprints.map(s => s.pilotName),
    data: topSprints.map(s => s.points),
    label: 'Sprint-Punkte',
    title: `Top Sprint-Wertungen - Saison ${seasonString}`,
    color: CHART_COLORS.senary,
    tooltipCallback: (context) => {
      const sprint = topSprints[context.dataIndex];
      return [
        `${sprint.points.toFixed(1)} Punkte`,
        `Geschwindigkeit: ${sprint.speed.toFixed(1)} km/h`,
        `Distanz: ${sprint.distance.toFixed(1)} km`,
        `Datum: ${formatDateForDisplay(sprint.date)}`
      ];
    }
  });
}

/**
 * Rendert Saisonverlauf (wöchentlich)
 */
export function renderMonthlyProgressChart(pilots, containerId = 'monthly-progress-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  chartContainer.innerHTML = '';
  const seasonString = getSeasonString(getSeasonFromPilots(pilots));

  // Sammle Wochendaten
  const weeklyData = {};

  pilots.forEach(pilot => {
    pilot.allFlights?.forEach(flight => {
      const date = new Date(flight.date);
      const weekKey = getWeekKey(date);

      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          week: getWeekNumber(date),
          year: date.getFullYear(),
          flights: 0,
          totalKm: 0,
          maxKm: 0,
          pilots: new Set()
        };
      }

      weeklyData[weekKey].flights++;
      weeklyData[weekKey].totalKm += flight.km || 0;
      weeklyData[weekKey].maxKm = Math.max(weeklyData[weekKey].maxKm, flight.km || 0);
      weeklyData[weekKey].pilots.add(pilot.name);
    });
  });

  const sortedWeeks = Object.keys(weeklyData).sort();

  if (!sortedWeeks.length) {
    chartContainer.innerHTML = `<div class="no-data">Keine Daten für Saisonverlauf ${seasonString}</div>`;
    return;
  }

  if (!window.Chart) return;

  const canvas = document.createElement('canvas');
  chartContainer.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: sortedWeeks.map(week => {
        const data = weeklyData[week];
        return `KW ${data.week}/${String(data.year).slice(-2)}`;
      }),
      datasets: [
        {
          label: 'Anzahl Flüge',
          data: sortedWeeks.map(w => weeklyData[w].flights),
          borderColor: CHART_COLORS.tertiary.replace('0.7', '1'),
          backgroundColor: CHART_COLORS.tertiary,
          yAxisID: 'y',
          tension: 0.3,
          fill: false,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Durchschnitt km',
          data: sortedWeeks.map(w => {
            const data = weeklyData[w];
            return data.flights > 0 ? (data.totalKm / data.flights) : 0;
          }),
          borderColor: CHART_COLORS.secondary.replace('0.7', '1'),
          backgroundColor: CHART_COLORS.secondary,
          yAxisID: 'y1',
          tension: 0.3,
          fill: false,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Längster Flug km',
          data: sortedWeeks.map(w => weeklyData[w].maxKm),
          borderColor: CHART_COLORS.quaternary.replace('0.7', '1'),
          backgroundColor: CHART_COLORS.quaternary,
          yAxisID: 'y1',
          tension: 0.3,
          fill: false,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        title: {
          display: true,
          text: `Saisonverlauf ${seasonString} - Wöchentliche Entwicklung`,
          font: { size: 16, weight: 'bold' },
          padding: 20
        },
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            afterLabel: function (context) {
              const week = sortedWeeks[context.dataIndex];
              const data = weeklyData[week];
              return `Aktive Piloten: ${data.pilots.size}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Kalenderwoche' },
          grid: { display: false }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Anzahl Flüge' },
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: 'Kilometer' },
          beginAtZero: true,
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

// Hilfsfunktionen für Wochennummer-Berechnung
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function getWeekKey(date) {
  const year = date.getFullYear();
  const week = getWeekNumber(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Rendert alle Charts
 */
export function renderAllCharts(pilots) {
  renderPointsChart(pilots);
  renderTotalKmChart(pilots);
  renderTotalHoursChart(pilots);
  renderFlightsPerPilotChart(pilots);
  renderTopKmChart(pilots);
  renderWeGlidePointsChart(pilots);
  renderTopSpeedChart(pilots);
  renderMonthlyProgressChart(pilots);
}

