/**
 * SG Säntis Cup - Chart-Generatoren
 * 
 * Diese Datei enthält alle Funktionen zur Erstellung und 
 * Aktualisierung von Charts (Diagrammen) für die Anwendung.
 */

import { formatNumber, formatDateForDisplay } from '../utils/utils.js';
import { APP_CONFIG } from '../config/constants.js';

/**
 * Rendert einen Chart für die Top-Kilometer
 * @param {Array} pilots - Array mit Pilotendaten
 * @param {string} containerId - ID des Container-Elements
 */
export function renderTopKmChart(pilots, containerId = 'km-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  // Container leeren
  chartContainer.innerHTML = '';

  // Alle Flüge sammeln
  let allFlights = [];
  if (Array.isArray(pilots)) {
    pilots.forEach(pilot => {
      if (!pilot || !Array.isArray(pilot.flights)) return;

      pilot.flights.forEach(flight => {
        if (!flight) return;

        allFlights.push({
          pilotName: pilot.name,
          ...flight
        });
      });
    });
  }

  // Gruppiere nach Pilot und nimm nur den besten Flug
  const bestFlightsByPilot = new Map();
  
  allFlights.forEach(flight => {
    const currentBest = bestFlightsByPilot.get(flight.pilotName);
    if (!currentBest || flight.km > currentBest.km) {
      bestFlightsByPilot.set(flight.pilotName, flight);
    }
  });

  // Konvertiere Map zu Array und sortiere
  const topFlights = Array.from(bestFlightsByPilot.values())
    .sort((a, b) => b.km - a.km)
    .slice(0, APP_CONFIG.CHART_LIMITS.TOP_KM);

  if (topFlights.length === 0) {
    const noData = document.createElement('div');
    noData.className = 'no-data';
    noData.textContent = 'Keine KM-Daten verfügbar.';
    noData.style.textAlign = 'center';
    noData.style.padding = '20px';
    chartContainer.appendChild(noData);
    return;
  }

  // Debug: Prüfe die Datenstruktur
  console.log('Top Flights Data:', topFlights[0]); // Debug-Ausgabe

  // Chart.js verwenden, falls verfügbar
  if (window.Chart && typeof Chart !== 'undefined') {
    const canvas = document.createElement('canvas');
    chartContainer.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topFlights.map(f => f.pilotName),
        datasets: [{
          label: 'Beste Distanz (km)',
          data: topFlights.map(f => f.km), // Stelle sicher, dass hier die km-Werte sind
          backgroundColor: 'rgba(76, 175, 80, 0.7)',
          borderColor: 'rgba(76, 175, 80, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Kilometer'
            }
          },
          x: {
            title: {
              display: false
            },
            ticks: {
              autoSkip: false,
              maxRotation: 45,
              minRotation: 45
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Top km Leistungen - Bester Flug pro Pilot',
            font: {
              size: 16
            }
          },
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const index = context.dataIndex;
                const flight = topFlights[index];
                
                // Mehrere Fallback-Optionen für den km-Wert
                let kmValue = 0;
                
                // Option 1: Von context.parsed.y (Chart.js Wert)
                if (context.parsed && typeof context.parsed.y === 'number') {
                  kmValue = context.parsed.y;
                }
                // Option 2: Von context.raw (Rohdaten)
                else if (typeof context.raw === 'number') {
                  kmValue = context.raw;
                }
                // Option 3: Direkt vom flight Objekt
                else if (flight && typeof flight.km === 'number') {
                  kmValue = flight.km;
                }
                
                // Debug-Ausgabe
                console.log('Tooltip Debug:', {
                  index: index,
                  parsed: context.parsed,
                  raw: context.raw,
                  flight: flight,
                  kmValue: kmValue
                });
                
                // Tooltip-Array erstellen
                const tooltipLines = [`${formatNumber(kmValue.toFixed(1))} km`];
                
                // Weitere Informationen nur hinzufügen, wenn vorhanden
                if (flight) {
                  if (flight.aircraftType) {
                    tooltipLines.push(`Flugzeug: ${flight.aircraftType}`);
                  }
                  if (flight.date) {
                    tooltipLines.push(`Datum: ${formatDateForDisplay(flight.date)}`);
                  }
                  if (flight.speed && flight.speed > 0) {
                    tooltipLines.push(`Geschwindigkeit: ${flight.speed.toFixed(1)} km/h`);
                  }
                  if (flight.points && flight.points > 0) {
                    tooltipLines.push(`Punkte: ${flight.points.toFixed(2)}`);
                  }
                }
                
                return tooltipLines;
              }
            }
          }
        },
        onClick: function (event, elements) {
          if (elements.length > 0) {
            const index = elements[0].index;
            const flight = topFlights[index];
            if (flight.rawData && flight.rawData.id) {
              window.open(`https://www.weglide.org/flight/${flight.rawData.id}`, '_blank');
            }
          }
        }
      }
    });
  }
}

export function renderTopSpeedChart(pilots, containerId = 'top-speed-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  // Container leeren
  chartContainer.innerHTML = '';

  // Prüfe ob Sprint-Daten vorhanden sind
  const pilotsWithSprints = pilots.filter(p => p.sprintData && p.sprintData.length > 0);

  if (pilotsWithSprints.length === 0) {
    // Keine Sprint-Daten vorhanden...
    const noData = document.createElement('div');
    noData.className = 'no-data';
    noData.innerHTML = `
      <p>Sprint-Daten werden geladen...</p>
      <p style="font-size: 12px; margin-top: 10px; color: #666;">
        Falls diese Meldung bestehen bleibt, sind möglicherweise keine Sprint-Daten verfügbar.
      </p>
    `;
    noData.style.textAlign = 'center';
    noData.style.padding = '20px';
    chartContainer.appendChild(noData);

    // Versuche Sprint-Daten automatisch zu laden
    loadSprintDataAndUpdateChart(pilots, containerId);
    return;
  }

  // Alle Sprint-Daten sammeln
  let allSprintFlights = [];

  pilotsWithSprints.forEach(pilot => {
    pilot.sprintData.forEach(sprint => {
      if (!sprint || !sprint.contest) return;

      allSprintFlights.push({
        pilotName: pilot.name,
        flightId: sprint.id,
        points: sprint.contest.points || 0,
        speed: sprint.contest.speed || 0,
        distance: sprint.contest.distance || 0,
        date: sprint.scoring_date || sprint.takeoff_time,
        aircraftType: sprint.aircraft ? sprint.aircraft.name : 'Unbekannt',
        takeoffAirport: sprint.takeoff_airport ? sprint.takeoff_airport.name : 'Unbekannt',
        region: sprint.takeoff_airport && sprint.takeoff_airport.region ? sprint.takeoff_airport.region : ''
      });
    });
  });

  // NEU: Gruppiere nach Pilot und nimm nur den besten Sprint (nach Punkten)
  const bestSprintsByPilot = new Map();

  allSprintFlights.forEach(sprint => {
    const currentBest = bestSprintsByPilot.get(sprint.pilotName);
    if (!currentBest || sprint.points > currentBest.points) {
      bestSprintsByPilot.set(sprint.pilotName, sprint);
    }
  });

  // Konvertiere Map zu Array und sortiere
  const topFlights = Array.from(bestSprintsByPilot.values())
    .sort((a, b) => b.points - a.points)
    .slice(0, APP_CONFIG.CHART_LIMITS.TOP_SPEED || 15);

  if (topFlights.length === 0) {
    const noData = document.createElement('div');
    noData.className = 'no-data';
    noData.textContent = 'Keine Sprint-Wertungen vorhanden.';
    noData.style.textAlign = 'center';
    noData.style.padding = '20px';
    chartContainer.appendChild(noData);
    return;
  }

  // Chart.js verwenden, falls verfügbar
  if (window.Chart && typeof Chart !== 'undefined') {
    const canvas = document.createElement('canvas');
    chartContainer.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topFlights.map(f => f.pilotName),
        datasets: [{
          label: 'Beste Sprint-Punkte',  // Label angepasst
          data: topFlights.map(f => f.points),
          backgroundColor: 'rgba(255, 152, 0, 0.7)', // Orange für Sprint-Punkte
          borderColor: 'rgba(255, 152, 0, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        //indexAxis: 'x', // Horizontale Balken
        scales: {
          x: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Sprint-Punkte'
            }
          },
          y: {
            title: {
              display: false
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Top Sprint-Wertungen - Bester Sprint pro Pilot (Saison 2025)', // Titel angepasst
            font: {
              size: 16
            }
          },
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const index = context.dataIndex;
                const flight = topFlights[index];

                return [
                  `${flight.points.toFixed(1)} Punkte`,
                  `Geschwindigkeit: ${flight.speed.toFixed(1)} km/h`,
                  `Distanz: ${flight.distance.toFixed(1)} km`,
                  `Flugzeug: ${flight.aircraftType}`,
                  `Datum: ${formatDateForDisplay(flight.date)}`,
                  `Startplatz: ${flight.takeoffAirport}`
                ];
              }
            }
          }
        },
        onClick: function (event, elements) {
          if (elements.length > 0) {
            const index = elements[0].index;
            const flight = topFlights[index];
            if (flight.flightId) {
              window.open(`https://www.weglide.org/flight/${flight.flightId}`, '_blank');
            }
          }
        }
      }
    });
  } else {
    // Fallback ohne Chart.js
    const maxPoints = topFlights[0].points;

    // Titel erstellen
    const titleElement = document.createElement('h3');
    titleElement.className = 'chart-title';
    titleElement.textContent = 'Top Sprint-Wertungen - Bester Sprint pro Pilot (Saison 2025)'; // Titel angepasst
    titleElement.style.textAlign = 'center';
    titleElement.style.margin = '10px 0 15px 0';
    titleElement.style.fontSize = '16px';
    titleElement.style.fontWeight = 'bold';
    titleElement.style.color = '#333';
    chartContainer.appendChild(titleElement);

    // Rest des Fallback-Codes bleibt gleich...
  }
}

/**
 * Hilfsfunktion zum automatischen Laden der Sprint-Daten
 */
async function loadSprintDataAndUpdateChart(pilots, containerId) {
  console.log('Versuche Sprint-Daten zu laden...');

  try {
    // Sprint-Daten für alle Piloten laden
    const currentYear = new Date().getFullYear();
    const batchSize = 3;
    let loadedCount = 0;

    for (let i = 0; i < pilots.length; i += batchSize) {
      const batch = pilots.slice(i, i + batchSize);

      const batchPromises = batch.map(async (pilot) => {
        try {
          const response = await fetch(`/api/proxy?path=sprint&user_id_in=${pilot.userId}&season_in=${currentYear}&limit=100`);

          if (response.ok) {
            const sprintData = await response.json();

            if (Array.isArray(sprintData)) {
              pilot.sprintData = sprintData;
              pilot.sprintStats = calculateSprintStats(sprintData);

              if (sprintData.length > 0) {
                loadedCount++;
              }
            }
          }
        } catch (error) {
          console.error(`Fehler beim Laden der Sprint-Daten für ${pilot.name}:`, error);
        }
      });

      await Promise.all(batchPromises);

      // Kleine Pause zwischen Batches
      if (i + batchSize < pilots.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`Sprint-Daten für ${loadedCount} Piloten geladen`);

    // Chart neu rendern
    if (loadedCount > 0) {
      renderTopSpeedChart(pilots, containerId);
    }

  } catch (error) {
    console.error('Fehler beim Laden der Sprint-Daten:', error);
  }
}

/**
 * Sprint-Statistiken berechnen
 */
function calculateSprintStats(sprints) {
  if (!sprints || sprints.length === 0) {
    return {
      totalSprints: 0,
      totalPoints: 0,
      maxPoints: 0,
      avgPoints: 0,
      maxSpeed: 0,
      avgSpeed: 0,
      maxDistance: 0,
      totalDistance: 0
    };
  }

  const points = sprints.map(s => s.contest?.points || 0);
  const speeds = sprints.map(s => s.contest?.speed || 0).filter(s => s > 0);
  const distances = sprints.map(s => s.contest?.distance || 0).filter(d => d > 0);

  return {
    totalSprints: sprints.length,
    totalPoints: points.reduce((sum, p) => sum + p, 0),
    maxPoints: Math.max(...points, 0),
    avgPoints: points.length > 0 ? points.reduce((sum, p) => sum + p, 0) / points.length : 0,
    maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
    avgSpeed: speeds.length > 0 ? speeds.reduce((sum, s) => sum + s, 0) / speeds.length : 0,
    maxDistance: distances.length > 0 ? Math.max(...distances) : 0,
    totalDistance: distances.reduce((sum, d) => sum + d, 0)
  };
}

/**
 * Rendert einen Chart mit den Gesamtpunkten pro Pilot
 * @param {Array} pilots - Array mit Pilotendaten
 * @param {string} containerId - ID des Container-Elements
 */
export function renderPointsChart(pilots, containerId = 'points-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  // Container leeren
  chartContainer.innerHTML = '';

  if (!Array.isArray(pilots) || pilots.length === 0) {
    const noData = document.createElement('div');
    noData.className = 'no-data';
    noData.textContent = 'Keine Punktedaten verfügbar.';
    noData.style.textAlign = 'center';
    noData.style.padding = '20px';
    chartContainer.appendChild(noData);
    return;
  }

  // Chart.js verwenden, falls verfügbar
  if (window.Chart && typeof Chart !== 'undefined') {
    const canvas = document.createElement('canvas');
    chartContainer.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const sortedPilots = [...pilots].sort((a, b) => b.totalPoints - a.totalPoints);
    const labels = sortedPilots.map(pilot => pilot.name);
    const data = sortedPilots.map(pilot => pilot.totalPoints);

    // Berechne Gesamtkilometer für jeden Piloten (nur beste 3 Flüge)
    const totalKm = sortedPilots.map(pilot => {
      return pilot.flights.reduce((sum, flight) => sum + (flight.km || 0), 0);
    });

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Gesamtpunkte SG Säntis Cup',
          data: data,
          backgroundColor: 'rgba(52, 152, 219, 0.7)',
          borderColor: 'rgba(52, 152, 219, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Punkte'
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            }
          },
          x: {
            title: {
              display: false
            },
            ticks: {
              font: {
                size: 12
              }
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'SG Säntis Cup - Gesamtpunkte pro Pilot',
            font: {
              size: 16
            }
          },
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const index = context.dataIndex;
                const pilot = sortedPilots[index];
                const km = totalKm[index];
                return [
                  `${formatNumber(pilot.totalPoints.toFixed(2))} Punkte`,
                  `Gesamt-km: ${formatNumber(km.toFixed(1))} km`,
                  `Pilotenfaktor: ${pilot.pilotFactor}`
                ];
              }
            }
          }
        }
      }
    });
  } else {
    // Fallback auf einfache Tabelle
    const title = document.createElement('h3');
    title.textContent = 'SG Säntis Cup - Gesamtpunkte pro Pilot';
    title.style.textAlign = 'center';
    title.style.marginBottom = '15px';
    chartContainer.appendChild(title);

    const table = document.createElement('table');
    table.className = 'points-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.marginTop = '15px';

    // Tabellenkopf
    let tableHTML = `
      <thead>
        <tr>
          <th style="text-align:left; padding:8px; border-bottom:2px solid #ddd;">Pilot</th>
          <th style="text-align:right; padding:8px; border-bottom:2px solid #ddd;">Gesamtpunkte</th>
        </tr>
      </thead>
      <tbody>
    `;

    // Tabellendaten
    const sortedPilots = [...pilots].sort((a, b) => b.totalPoints - a.totalPoints);
    sortedPilots.forEach(pilot => {
      tableHTML += `
        <tr>
          <td style="text-align:left; padding:8px; border-bottom:1px solid #ddd;">${pilot.name}</td>
          <td style="text-align:right; padding:8px; border-bottom:1px solid #ddd;">${formatNumber(pilot.totalPoints.toFixed(2))}</td>
        </tr>
      `;
    });

    tableHTML += '</tbody>';
    table.innerHTML = tableHTML;
    chartContainer.appendChild(table);
  }
}

/**
 * Rendert einen Chart für die Flüge pro Pilot
 * @param {Array} pilots - Array mit Pilotendaten
 * @param {string} containerId - ID des Container-Elements
 */
export function renderFlightsPerPilotChart(pilots, containerId = 'flights-per-pilot-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  // Container leeren
  chartContainer.innerHTML = '';

  const currentYear = new Date().getFullYear();

  // Daten aufbereiten
  const pilotFlightData = [];
  if (Array.isArray(pilots)) {
    pilots.forEach(pilot => {
      if (!pilot || !Array.isArray(pilot.allFlights)) return;

      const currentYearFlights = pilot.allFlights.filter(flight =>
        flight && flight.flightYear === currentYear
      );

      if (currentYearFlights.length > 0) {
        pilotFlightData.push({
          name: pilot.name,
          flightCount: currentYearFlights.length,
          totalDistance: Math.round(currentYearFlights.reduce((sum, flight) =>
            sum + (flight.km || 0), 0
          ))
        });
      }
    });
  }

  // Nach Fluganzahl sortieren (höchste zuerst)
  pilotFlightData.sort((a, b) => b.flightCount - a.flightCount);

  if (pilotFlightData.length === 0) {
    const noData = document.createElement('div');
    noData.className = 'no-data';
    noData.textContent = 'Keine Flugdaten für das aktuelle Jahr verfügbar.';
    noData.style.textAlign = 'center';
    noData.style.padding = '20px';
    chartContainer.appendChild(noData);
    return;
  }

  // Chart.js verwenden, falls verfügbar
  if (window.Chart && typeof Chart !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.style.height = '450px';
    chartContainer.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: pilotFlightData.map(p => p.name),
        datasets: [{
          label: 'Anzahl Flüge',
          data: pilotFlightData.map(p => p.flightCount),
          backgroundColor: 'rgba(155, 89, 182, 0.7)',
          borderColor: 'rgba(155, 89, 182, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            },
            title: {
              display: true,
              text: 'Anzahl Flüge'
            }
          },
          x: {
            title: {
              display: false
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: `Anzahl Flüge (${currentYear})`,
            font: {
              size: 16
            }
          },
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const index = context.dataIndex;
                const pilot = pilotFlightData[index];
                return [
                  `${pilot.flightCount} ${pilot.flightCount === 1 ? 'Flug' : 'Flüge'}`,
                  `Gesamt-km: ${formatNumber(pilot.totalDistance)} km`
                ];
              }
            }
          }
        }
      }
    });
  } else {
    // Fallback-Tabelle wenn Chart.js nicht verfügbar ist
    const title = document.createElement('h3');
    title.textContent = `Anzahl Flüge (${currentYear})`;
    title.style.textAlign = 'center';
    title.style.marginBottom = '15px';
    chartContainer.appendChild(title);

    const table = document.createElement('table');
    table.className = 'flights-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.marginTop = '15px';

    let tableHTML = `
      <thead>
        <tr>
          <th style="text-align:left; padding:8px; border-bottom:2px solid #ddd;">Pilot</th>
          <th style="text-align:right; padding:8px; border-bottom:2px solid #ddd;">Anzahl Flüge</th>
          <th style="text-align:right; padding:8px; border-bottom:2px solid #ddd;">Gesamt-km</th>
        </tr>
      </thead>
      <tbody>
    `;

    pilotFlightData.forEach(pilot => {
      tableHTML += `
        <tr>
          <td style="text-align:left; padding:8px; border-bottom:1px solid #ddd;">${pilot.name}</td>
          <td style="text-align:right; padding:8px; border-bottom:1px solid #ddd;">${pilot.flightCount}</td>
          <td style="text-align:right; padding:8px; border-bottom:1px solid #ddd;">${formatNumber(pilot.totalDistance)} km</td>
        </tr>
      `;
    });

    tableHTML += '</tbody>';
    table.innerHTML = tableHTML;
    chartContainer.appendChild(table);
  }
}

/**
 * Rendert einen Chart für die WeGlide-Punkte
 * @param {Array} pilots - Array mit Pilotendaten
 * @param {string} containerId - ID des Container-Elements 
 */
export function renderWeGlidePointsChart(pilots, containerId = 'weglide-points-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  // Container leeren
  chartContainer.innerHTML = '';

  // Für jeden Piloten die WeGlide-Punkte der besten 6 Flüge berechnen
  const pilotPointsData = [];
  if (Array.isArray(pilots)) {
    pilots.forEach(pilot => {
      if (!pilot || !Array.isArray(pilot.allFlights)) return;

      // Alle Flüge nach originalPoints sortieren (höchste zuerst)
      const sortedFlights = [...pilot.allFlights].sort((a, b) => {
        const pointsA = a.originalPoints || 0;
        const pointsB = b.originalPoints || 0;
        return pointsB - pointsA;
      });

      // Die besten 6 Flüge nehmen (oder alle, wenn weniger als 6)
      const bestFlights = sortedFlights.slice(0, 6);

      // Summe der WeGlide-Punkte und Kilometer berechnen
      const totalWeGlidePoints = bestFlights.reduce((sum, flight) => {
        return sum + (flight.originalPoints || 0);
      }, 0);

      const totalKm = bestFlights.reduce((sum, flight) => sum + (flight.km || 0), 0);

      if (totalWeGlidePoints > 0) {
        pilotPointsData.push({
          name: pilot.name,
          totalWeGlidePoints: Math.round(totalWeGlidePoints),
          flightCount: bestFlights.length,
          totalKm: totalKm
        });
      }
    });
  }

  // Nach WeGlide-Punkten sortieren (höchste zuerst)
  pilotPointsData.sort((a, b) => b.totalWeGlidePoints - a.totalWeGlidePoints);

  if (pilotPointsData.length === 0) {
    const noData = document.createElement('div');
    noData.className = 'no-data';
    noData.textContent = 'Keine WeGlide-Punkte verfügbar.';
    noData.style.textAlign = 'center';
    noData.style.padding = '20px';
    chartContainer.appendChild(noData);
    return;
  }

  // Chart.js verwenden, falls verfügbar
  if (window.Chart && typeof Chart !== 'undefined') {
    const canvas = document.createElement('canvas');
    chartContainer.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: pilotPointsData.map(p => p.name),
        datasets: [{
          label: 'WeGlide Punkte (beste 6 Flüge)',
          data: pilotPointsData.map(p => p.totalWeGlidePoints),
          backgroundColor: 'rgba(46, 204, 167, 0.7)',
          borderColor: 'rgba(46, 204, 167, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        //indexAxis: 'x', // Horizontale Balken
        scales: {
          x: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'WeGlide Punkte (Summe)'
            }
          },
          y: {
            title: {
              display: false
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'WeGlide Punkte - Beste 6 Flüge pro Pilot',
            font: {
              size: 16
            }
          },
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const index = context.dataIndex;
                const pilot = pilotPointsData[index];
                return [
                  `${formatNumber(context.parsed.y)} Punkte`,
                  `Gesamt-km: ${formatNumber(pilot.totalKm.toFixed(1))} km`,
                  `${pilot.flightCount} ${pilot.flightCount === 1 ? 'Flug' : 'Flüge'} gewertet`
                ];
              }
            }
          }
        }
      }
    });
  } else {
    // Fallback-Tabelle wenn Chart.js nicht verfügbar ist
    const title = document.createElement('h3');
    title.textContent = 'WeGlide Punkte - Beste 6 Flüge pro Pilot';
    title.style.textAlign = 'center';
    title.style.marginBottom = '15px';
    chartContainer.appendChild(title);

    const table = document.createElement('table');
    table.className = 'weglide-points-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.marginTop = '15px';

    let tableHTML = `
      <thead>
        <tr>
          <th style="text-align:left; padding:8px; border-bottom:2px solid #ddd;">Pilot</th>
          <th style="text-align:right; padding:8px; border-bottom:2px solid #ddd;">WeGlide Punkte</th>
          <th style="text-align:right; padding:8px; border-bottom:2px solid #ddd;">Anzahl Flüge</th>
        </tr>
      </thead>
      <tbody>
    `;

    pilotPointsData.forEach(pilot => {
      tableHTML += `
        <tr>
          <td style="text-align:left; padding:8px; border-bottom:1px solid #ddd;">${pilot.name}</td>
          <td style="text-align:right; padding:8px; border-bottom:1px solid #ddd;">${formatNumber(pilot.totalWeGlidePoints)}</td>
          <td style="text-align:right; padding:8px; border-bottom:1px solid #ddd;">${pilot.flightCount}</td>
        </tr>
      `;
    });

    tableHTML += '</tbody>';
    table.innerHTML = tableHTML;
    chartContainer.appendChild(table);
  }
}

export function renderMonthlyProgressChart(pilots, containerId = 'monthly-progress-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  chartContainer.innerHTML = '';

  // Sammle Monatsdaten
  const monthlyData = {};

  pilots.forEach(pilot => {
    if (!pilot.allFlights) return;

    pilot.allFlights.forEach(flight => {
      const date = new Date(flight.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          flights: 0,
          totalKm: 0,
          maxKm: 0,
          pilots: new Set()
        };
      }

      monthlyData[monthKey].flights++;
      monthlyData[monthKey].totalKm += flight.km || 0;
      monthlyData[monthKey].maxKm = Math.max(monthlyData[monthKey].maxKm, flight.km || 0);
      monthlyData[monthKey].pilots.add(pilot.name);
    });
  });

  // Sortiere Monate
  const sortedMonths = Object.keys(monthlyData).sort();

  if (sortedMonths.length === 0) {
    chartContainer.innerHTML = '<div class="no-data">Keine Monatsdaten verfügbar</div>';
    return;
  }

  // Chart.js
  if (window.Chart && typeof Chart !== 'undefined') {
    const canvas = document.createElement('canvas');
    chartContainer.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: sortedMonths.map(month => {
          const [year, m] = month.split('-');
          return new Date(year, m - 1).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
        }),
        datasets: [
          {
            label: 'Anzahl Flüge',
            data: sortedMonths.map(m => monthlyData[m].flights),
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            yAxisID: 'y',
            tension: 0.1
          },
          {
            label: 'Durchschnitt km',
            data: sortedMonths.map(m => monthlyData[m].totalKm / monthlyData[m].flights),
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            yAxisID: 'y1',
            tension: 0.1
          },
          {
            label: 'Längster Flug',
            data: sortedMonths.map(m => monthlyData[m].maxKm),
            borderColor: 'rgb(255, 205, 86)',
            backgroundColor: 'rgba(255, 205, 86, 0.2)',
            yAxisID: 'y1',
            tension: 0.1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            display: true,
            text: 'Saisonverlauf - Monatliche Entwicklung',
            font: { size: 16 }
          },
          tooltip: {
            callbacks: {
              afterLabel: function (context) {
                const month = sortedMonths[context.dataIndex];
                const data = monthlyData[month];
                return `Aktive Piloten: ${data.pilots.size}`;
              }
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Anzahl Flüge'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Kilometer'
            },
            grid: {
              drawOnChartArea: false,
            }
          }
        }
      }
    });
  }
}

/**
 * Rendert alle Charts
 * @param {Array} pilots - Array mit Pilotendaten
 */
export function renderAllCharts(pilots) {
  renderPointsChart(pilots);
  renderFlightsPerPilotChart(pilots);
  renderTopKmChart(pilots);
  renderTopSpeedChart(pilots);
  renderWeGlidePointsChart(pilots);
  renderMonthlyProgressChart(pilots); // NEU!
}