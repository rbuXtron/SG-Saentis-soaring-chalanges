// /public/js/tools/export-pilot-factors.js
// Ausführen am Ende der Saison zur Archivierung der Pilotenfaktoren

async function exportPilotFactors() {
    const pilots = window.pilotData || window.sgApp?.pilotData;
    
    if (!pilots || !Array.isArray(pilots)) {
        console.error('❌ Keine Pilotendaten gefunden!');
        console.log('Tipp: Stelle sicher, dass die Rangliste geladen ist.');
        return;
    }
    
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    // Bestimme Saison (Oktober = Start neue Saison)
    const seasonYear = currentMonth >= 10 ? currentYear + 1 : currentYear;
    const seasonString = `${seasonYear - 1}/${seasonYear}`;
    
    const pilotFactorsData = {
        metadata: {
            season: seasonString,
            generated: currentDate.toISOString().split('T')[0],
            generatedTime: currentDate.toISOString(),
            description: `Pilotenfaktoren Ende Saison ${seasonString}`,
            clubId: 1281,
            clubName: "SG Säntis",
            totalPilots: pilots.length,
            activePilots: pilots.filter(p => (p.allFlights?.length || 0) > 0).length
        },
        pilots: {}
    };
    
    // Sammle Pilotenfaktoren
    pilots.forEach(pilot => {
        if (!pilot.userId || !pilot.name) return;
        
        // Berechne beste Distanz aus allen Flügen
        let bestDistance = 0;
        let bestFlightDate = null;
        let totalFlights = 0;
        
        // Prüfe alle Flüge (aktuelle + historische)
        const allFlights = [
            ...(pilot.allFlights || []),
            ...(pilot.historicalFlights || [])
        ];
        
        allFlights.forEach(flight => {
            if (flight.km > bestDistance) {
                bestDistance = flight.km;
                bestFlightDate = flight.date || flight.scoring_date;
            }
            totalFlights++;
        });
        
        // Nur Piloten mit Flügen speichern
        if (totalFlights > 0 || pilot.pilotFactor !== 4.0) {
            pilotFactorsData.pilots[pilot.userId] = {
                name: pilot.name,
                factor: pilot.pilotFactor || 4.0,
                bestDistance: Math.round(bestDistance),
                totalFlights: totalFlights,
                lastFlight: bestFlightDate,
                // Zusätzliche Infos für Statistik
                rankingFlights: pilot.rankingFlights?.length || 0,
                totalPoints: Math.round(pilot.totalPoints || 0)
            };
        }
    });
    
    // Statistiken hinzufügen
    const factors = Object.values(pilotFactorsData.pilots);
    pilotFactorsData.statistics = {
        factorDistribution: {
            "1.0": factors.filter(p => p.factor === 1.0).length,
            "1.2": factors.filter(p => p.factor === 1.2).length,
            "1.4": factors.filter(p => p.factor === 1.4).length,
            "1.6": factors.filter(p => p.factor === 1.6).length,
            "2.0": factors.filter(p => p.factor === 2.0).length,
            "3.0": factors.filter(p => p.factor === 3.0).length,
            "4.0": factors.filter(p => p.factor === 4.0).length
        },
        averageFactor: (factors.reduce((sum, p) => sum + p.factor, 0) / factors.length).toFixed(2),
        bestPilot: factors.sort((a, b) => b.bestDistance - a.bestDistance)[0]?.name || "N/A",
        longestDistance: Math.max(...factors.map(p => p.bestDistance))
    };
    
    // JSON formatieren
    const jsonString = JSON.stringify(pilotFactorsData, null, 2);
    
    // Download triggern
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pilot-factors-${seasonYear}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Konsolen-Output
    console.log('✅ Pilotenfaktoren exportiert!');
    console.log(`📊 Saison: ${seasonString}`);
    console.log(`👥 ${Object.keys(pilotFactorsData.pilots).length} Piloten mit Faktoren`);
    console.log('📈 Faktor-Verteilung:', pilotFactorsData.statistics.factorDistribution);
    console.log(`🏆 Beste Distanz: ${pilotFactorsData.statistics.longestDistance}km von ${pilotFactorsData.statistics.bestPilot}`);
    
    return pilotFactorsData;
}

// Hilfsfunktion zum Anzeigen der aktuellen Faktoren
function showCurrentFactors() {
    const pilots = window.pilotData || window.sgApp?.pilotData;
    if (!pilots) {
        console.error('Keine Pilotendaten geladen!');
        return;
    }
    
    console.table(
        pilots
            .filter(p => p.pilotFactor && p.pilotFactor !== 4.0)
            .map(p => ({
                Name: p.name,
                Faktor: p.factor,
                "Beste Distanz": p.bestHistoricalDistance + " km",
                "Flüge 2025": p.allFlights?.length || 0
            }))
            .sort((a, b) => a.Faktor - b.Faktor)
    );
}

// Export für Browser-Konsole
window.exportPilotFactors = exportPilotFactors;
window.showCurrentFactors = showCurrentFactors;

// Anleitung in Konsole
console.log('📋 Pilotenfaktor-Export Tool geladen!');
console.log('Verwendung:');
console.log('  exportPilotFactors() - Exportiert Faktoren als JSON');
console.log('  showCurrentFactors() - Zeigt aktuelle Faktoren in Tabelle');