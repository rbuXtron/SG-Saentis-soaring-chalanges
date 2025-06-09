// /public/js/tools/export-historical-badges.js
// Dieses Tool kannst du am Ende der Saison ausführen

async function exportHistoricalBadges() {
    const pilots = window.pilotData;
    if (!pilots) {
        console.error('Keine Pilotendaten geladen!');
        return;
    }
    
    const historicalData = {
        metadata: {
            season: "2024/2025",
            lastUpdated: new Date().toISOString().split('T')[0],
            description: "Höchste erreichte Multi-Level Badge Punkte bis Ende Saison 2024/2025"
        },
        badges: {}
    };
    
    pilots.forEach(pilot => {
        const userBadges = {};
        
        pilot.allTimeBadges?.forEach(badge => {
            if (MULTI_LEVEL_BADGE_IDS.includes(badge.badge_id)) {
                userBadges[badge.badge_id] = badge.points || 0;
            }
        });
        
        if (Object.keys(userBadges).length > 0) {
            historicalData.badges[pilot.userId] = userBadges;
        }
    });
    
    // Download als JSON
    const blob = new Blob([JSON.stringify(historicalData, null, 2)], 
        { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historical-badges-${new Date().getFullYear()}.json`;
    a.click();
    
    console.log('✅ Historische Badge-Daten exportiert!');
}

// In der Konsole ausführen:
// exportHistoricalBadges();