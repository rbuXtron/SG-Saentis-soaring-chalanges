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

  // Nach Distanz sortieren (höchste zuerst)
  allFlights.sort((a, b) => b.km - a.km);

  // Top 15 nehmen
  //const topFlights = allFlights.slice(0, 15);
  const topFlights = allFlights.slice(0, APP_CONFIG.CHART_LIMITS.TOP_KM);

  if (topFlights.length === 0) {
    const noData = document.createElement('div');
    noData.className = 'no-data';
    noData.textContent = 'Keine KM-Daten verfügbar.';
    noData.style.textAlign = 'center';
    noData.style.padding = '20px';
    chartContainer.appendChild(noData);
    return;
  }

  // Maximalen KM-Wert finden
  const maxKm = topFlights[0].km;

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
          label: 'Distanz (km)',
          data: topFlights.map(f => f.km),
          backgroundColor: 'rgba(76, 175, 80, 0.7)',
          borderColor: 'rgba(76, 175, 80, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y', // WICHTIG: Horizontale Balken
        scales: {
          x: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Kilometer'
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
            text: 'Top km Leistungen',
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
                  `${formatNumber(context.parsed.x.toFixed(1))} km`,
                  `Flugzeug: ${flight.aircraftType || 'Unbekannt'}`,
                  `Datum: ${formatDateForDisplay(flight.date)}`,
                  `Geschwindigkeit: ${flight.speed ? flight.speed.toFixed(1) + ' km/h' : 'N/A'}`
                ];
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
  } else {

    // Titel erstellen
    const titleElement = document.createElement('h3');
    titleElement.className = 'chart-title';
    titleElement.textContent = 'Top km Leistungen';
    titleElement.style.textAlign = 'center';
    titleElement.style.margin = '10px 0 15px 0';
    titleElement.style.fontSize = '16px';
    titleElement.style.fontWeight = 'bold';
    titleElement.style.color = '#333';
    chartContainer.appendChild(titleElement);

    // Wrapper für die Chart-Items
    const wrapper = document.createElement('div');
    wrapper.className = 'km-chart-wrapper';
    wrapper.style.padding = '5px 5px';
    wrapper.style.height = 'auto';
    wrapper.style.maxHeight = 'calc(100% - 60px)';
    chartContainer.appendChild(wrapper);

    // Balken erstellen
    const fragment = document.createDocumentFragment();

    topFlights.forEach((flight, index) => {
      const item = document.createElement('div');
      item.className = 'chart-item';

      // Pilot-Name
      const nameLabel = document.createElement('div');
      nameLabel.className = 'pilot-name';
      nameLabel.textContent = flight.pilotName;

      // Balken-Container
      const barContainer = document.createElement('div');
      barContainer.className = 'bar-container';

      // Balken
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.width = '0%'; // Start bei 0 für Animation

      // Helle Farben für bessere Lesbarkeit des Texts
      // Erste 3 Plätze bekommen spezielle Farben
      if (index === 0) {
        bar.style.background = 'rgba(76, 175, 80, 0.6)'; // Hellgrün
      } else if (index === 1) {
        bar.style.background = 'rgba(139, 195, 74, 0.6)'; // Hellgrün-Gelb
      } else if (index === 2) {
        bar.style.background = 'rgba(205, 220, 57, 0.6)'; // Hellgelb
      } else {
        // Standardfarbe für alle anderen
        bar.style.background = 'rgba(120, 194, 173, 0.6)'; // Helles Türkis
      }

      // Wert-Label
      const valueLabel = document.createElement('div');
      valueLabel.className = 'value-label';
      valueLabel.textContent = `${Math.round(flight.km)} km`;
      valueLabel.style.color = '#333'; // Dunkle Textfarbe für bessere Lesbarkeit
      valueLabel.style.fontWeight = 'bold';
      valueLabel.style.textShadow = '0 0 2px white'; // Weißer Schatten für bessere Lesbarkeit

      // Elemente zusammenfügen
      barContainer.appendChild(bar);
      barContainer.appendChild(valueLabel);
      item.appendChild(nameLabel);
      item.appendChild(barContainer);

      // Tooltip-Inhalt erstellen
      const tooltipContent = `
      <div><strong>${flight.pilotName}</strong></div>
      <div>Flugzeug: ${flight.aircraftType || 'Unbekannt'}</div>
      <div>Datum: ${formatDateForDisplay(flight.date)}</div>
      <div>Strecke: ${flight.km.toFixed(1)} km</div>
      <div>Geschwindigkeit: ${flight.speed ? flight.speed.toFixed(1) + ' km/h' : 'keine Angabe'}</div>
      <div><strong>Punkte: ${flight.points ? flight.points.toFixed(2) : 'keine'}</strong></div>
    `;

      // Tooltip-Funktionalität hinzufügen
      const tooltip = document.createElement('div');
      tooltip.className = 'chart-tooltip';
      tooltip.style.position = 'absolute';
      tooltip.style.display = 'none';
      tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      tooltip.style.color = '#fff';
      tooltip.style.padding = '10px';
      tooltip.style.borderRadius = '4px';
      tooltip.style.fontSize = '12px';
      tooltip.style.zIndex = '1000';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
      tooltip.style.minWidth = '150px';
      tooltip.style.maxWidth = '300px';

      item.addEventListener('mouseenter', function (e) {
        tooltip.innerHTML = tooltipContent;
        tooltip.style.display = 'block';
        document.body.appendChild(tooltip);
        updateTooltipPosition(e);
      });

      item.addEventListener('mousemove', function (e) {
        updateTooltipPosition(e);
      });

      item.addEventListener('mouseleave', function () {
        tooltip.style.display = 'none';
        if (tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
      });

      // Hilfsfunktion für Tooltip-Position
      function updateTooltipPosition(e) {
        const x = e.pageX + 10;
        const y = e.pageY + 10;
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
      }

      // WeGlide-Link hinzufügen, falls Flug-ID vorhanden
      if (flight.rawData && flight.rawData.id) {
        item.style.cursor = 'pointer';
        item.addEventListener('click', function () {
          window.open(`https://www.weglide.org/flight/${flight.rawData.id}`, '_blank');
        });
      }

      fragment.appendChild(item);
    });

    // Alles auf einmal zum DOM hinzufügen
    wrapper.appendChild(fragment);

    // Balken animieren (mit einem kleinen Delay)
    setTimeout(() => {
      wrapper.querySelectorAll('.bar').forEach((bar, index) => {
        const flight = topFlights[index];
        const percentWidth = (flight.km / maxKm * 100);

        // Mit leichter Verzögerung für jeden Balken
        setTimeout(() => {
          bar.style.width = `${percentWidth}%`;
        }, index * 50);
      });
    }, 100);
  }
}

/**
 * Rendert eine Chart für die Top Sprint-Geschwindigkeiten
 * ANGEPASST: Nutzt jetzt sprintData statt allFlights
 * @param {Array} pilots - Array mit Pilotendaten
 * @param {string} containerId - ID des Container-Elements
 */
export function renderTopSpeedChart(pilots, containerId = 'top-speed-chart') {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;

  // Container leeren
  chartContainer.innerHTML = '';

  // Alle Sprint-Daten sammeln
  let allSprintFlights = [];
  if (Array.isArray(pilots)) {
    pilots.forEach(pilot => {
      if (!pilot || !pilot.sprintData) return;

      // Sprint-Daten können entweder in sprintData oder topSpeedSprints sein
      const sprints = pilot.sprintData || pilot.topSpeedSprints || [];
      
      if (Array.isArray(sprints)) {
        sprints.forEach(sprint => {
          if (!sprint || !sprint.contest || !sprint.contest.speed || sprint.contest.speed <= 0) return;

          allSprintFlights.push({
            pilotName: pilot.name,
            flightId: sprint.id,
            speed: sprint.contest.speed,
            distance: sprint.contest.distance,
            points: sprint.contest.points,
            date: sprint.scoring_date || sprint.takeoff_time,
            aircraftType: sprint.aircraft ? sprint.aircraft.name : 'Unbekannt',
            takeoffAirport: sprint.takeoff_airport ? sprint.takeoff_airport.name : 'Unbekannt',
            region: sprint.takeoff_airport && sprint.takeoff_airport.region ? sprint.takeoff_airport.region : ''
          });
        });
      }
    });
  }

  // Nach Geschwindigkeit sortieren (höchste zuerst)
  allSprintFlights.sort((a, b) => b.speed - a.speed);

  // Top 15 nehmen
  const topFlights = allSprintFlights.slice(0, APP_CONFIG.CHART_LIMITS.TOP_SPEED || 15);

  if (topFlights.length === 0) {
    const noData = document.createElement('div');
    noData.className = 'no-data';
    noData.textContent = 'Keine Geschwindigkeitsdaten verfügbar.';
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
          label: 'Geschwindigkeit (km/h)',
          data: topFlights.map(f => f.speed),
          backgroundColor: 'rgba(3, 155, 229, 0.7)',
          borderColor: 'rgba(3, 155, 229, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y', // WICHTIG: Horizontale Balken
        scales: {
          x: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Geschwindigkeit (km/h)'
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
            text: 'Top Sprint Leistungen',
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
                  `${formatNumber(context.parsed.x.toFixed(1))} km/h`,
                  `Flugzeug: ${flight.aircraftType}`,
                  `Datum: ${formatDateForDisplay(flight.date)}`,
                  `Distanz: ${flight.distance ? flight.distance.toFixed(1) + ' km' : 'N/A'}`,
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
    // Fallback bleibt wie vorher...

    // Maximale Geschwindigkeit finden
    const maxSpeed = topFlights[0].speed;

    // Titel erstellen
    const titleElement = document.createElement('h3');
    titleElement.className = 'chart-title';
    titleElement.textContent = 'Top Sprint Leistungen';
    titleElement.style.textAlign = 'center';
    titleElement.style.margin = '10px 0 15px 0';
    titleElement.style.fontSize = '16px';
    titleElement.style.fontWeight = 'bold';
    titleElement.style.color = '#333';
    chartContainer.appendChild(titleElement);

    // Wrapper für die Chart-Items
    const wrapper = document.createElement('div');
    wrapper.className = 'speed-chart-wrapper';
    wrapper.style.padding = '5px 5px';
    wrapper.style.height = 'auto';
    wrapper.style.maxHeight = 'calc(100% - 60px)';
    chartContainer.appendChild(wrapper);

    // Balken erstellen
    const fragment = document.createDocumentFragment();

    topFlights.forEach((flight, index) => {
      const item = document.createElement('div');
      item.className = 'chart-item';

      // Pilot-Name
      const nameLabel = document.createElement('div');
      nameLabel.className = 'pilot-name';
      nameLabel.textContent = flight.pilotName;

      // Balken-Container
      const barContainer = document.createElement('div');
      barContainer.className = 'bar-container';

      // Balken mit helleren Farben für Speed-Chart
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.width = '0%'; // Start bei 0 für Animation

      // Helle Farben für Speed-Chart für bessere Lesbarkeit des Texts
      if (index === 0) {
        bar.style.background = 'rgba(3, 155, 229, 0.5)'; // Helles Blau
      } else if (index === 1) {
        bar.style.background = 'rgba(3, 244, 188, 0.5)'; // Helleres Blau
      } else if (index === 2) {
        bar.style.background = 'rgba(41, 246, 127, 0.5)'; // Noch helleres Blau
      } else {
        bar.style.background = 'rgba(79, 195, 247, 0.5)'; // Standardblau für alle anderen
      }

      // Wert-Label mit verbesserter Lesbarkeit
      const valueLabel = document.createElement('div');
      valueLabel.className = 'value-label';
      valueLabel.textContent = `${Math.round(flight.speed)} km/h`;
      valueLabel.style.color = '#333'; // Dunkle Textfarbe für bessere Lesbarkeit
      valueLabel.style.fontWeight = 'bold';
      valueLabel.style.textShadow = '0 0 2px white'; // Weißer Schatten für bessere Lesbarkeit

      // Elemente zusammenfügen
      barContainer.appendChild(bar);
      barContainer.appendChild(valueLabel);
      item.appendChild(nameLabel);
      item.appendChild(barContainer);


      // Tooltip-Inhalt erstellen
      const tooltipContent = `
      <div><strong>${flight.pilotName}</strong></div>
      <div>Flugzeug: ${flight.aircraftType || 'Unbekannt'}</div>
      <div>Datum: ${formatDateForDisplay(flight.date)}</div>
      <div>Geschwindigkeit: ${flight.speed.toFixed(1)} km/h</div>
      <div>Distanz: ${flight.distance ? flight.distance.toFixed(1) + ' km' : 'keine Angabe'}</div>
      <div>Startplatz: ${flight.takeoffAirport || 'Unbekannt'}</div>
      ${flight.region ? `<div>Region: ${flight.region}</div>` : ''}
    `;

      // Tooltip-Funktionalität hinzufügen
      const tooltip = document.createElement('div');
      tooltip.className = 'chart-tooltip';
      tooltip.style.position = 'absolute';
      tooltip.style.display = 'none';
      tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      tooltip.style.color = '#fff';
      tooltip.style.padding = '10px';
      tooltip.style.borderRadius = '4px';
      tooltip.style.fontSize = '12px';
      tooltip.style.zIndex = '1000';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
      tooltip.style.minWidth = '150px';
      tooltip.style.maxWidth = '300px';

      item.addEventListener('mouseenter', function (e) {
        tooltip.innerHTML = tooltipContent;
        tooltip.style.display = 'block';
        document.body.appendChild(tooltip);
        updateTooltipPosition(e);
      });

      item.addEventListener('mousemove', function (e) {
        updateTooltipPosition(e);
      });

      item.addEventListener('mouseleave', function () {
        tooltip.style.display = 'none';
        if (tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
      });

      // Hilfsfunktion für Tooltip-Position
      function updateTooltipPosition(e) {
        const x = e.pageX + 10;
        const y = e.pageY + 10;
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
      }

      // WeGlide-Link hinzufügen, falls Flug-ID vorhanden
      if (flight.flightId) {
        item.style.cursor = 'pointer';
        item.addEventListener('click', function () {
          window.open(`https://www.weglide.org/flight/${flight.flightId}`, '_blank');
        });
      }

      fragment.appendChild(item);
    });

    // Alles auf einmal zum DOM hinzufügen
    wrapper.appendChild(fragment);

    // Balken animieren (mit einem kleinen Delay)
    setTimeout(() => {
      wrapper.querySelectorAll('.bar').forEach((bar, index) => {
        const flight = topFlights[index];
        const percentWidth = (flight.speed / maxSpeed * 100);

        // Mit leichter Verzögerung für jeden Balken
        setTimeout(() => {
          bar.style.width = `${percentWidth}%`;
        }, index * 50);
      });
    }, 100);
  }
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
        indexAxis: 'x', // Horizontale Balken
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
                  `${formatNumber(context.parsed.x)} Punkte`,
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
              afterLabel: function(context) {
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