// /api/club-flights-complete.js
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { startDate = '2023-06-01', clubId = '1281' } = req.query;
    
    console.log(`[API] Lade alle Club-Flüge ab ${startDate} für Club ${clubId}`);
    
    // Hilfsfunktionen
    function generateMonthIntervals(start, end) {
      const intervals = [];
      const current = new Date(start);
      const endDate = new Date(end);
      
      while (current <= endDate) {
        const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
        const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        
        // Anpassen wenn Start-Datum nicht der 1. des Monats ist
        if (intervals.length === 0 && new Date(start) > monthStart) {
          monthStart.setTime(new Date(start).getTime());
        }
        
        // Anpassen wenn End-Datum nicht der letzte des Monats ist
        if (monthEnd > endDate) {
          monthEnd.setTime(endDate.getTime());
        }
        
        intervals.push({
          start: monthStart.toISOString().split('T')[0],
          end: monthEnd.toISOString().split('T')[0],
          year: monthStart.getFullYear(),
          month: monthStart.getMonth() + 1
        });
        
        // Zum nächsten Monat
        current.setMonth(current.getMonth() + 1);
      }
      
      return intervals;
    }
    
    // Funktion für Wochen-Intervalle (falls Monat zu viele Flüge hat)
    function generateWeekIntervals(year, month) {
      const intervals = [];
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      
      let current = new Date(monthStart);
      
      while (current <= monthEnd) {
        const weekStart = new Date(current);
        const weekEnd = new Date(current);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        if (weekEnd > monthEnd) {
          weekEnd.setTime(monthEnd.getTime());
        }
        
        intervals.push({
          start: weekStart.toISOString().split('T')[0],
          end: weekEnd.toISOString().split('T')[0]
        });
        
        current.setDate(current.getDate() + 7);
      }
      
      return intervals;
    }
    
    // Funktion zum Laden von Flügen für einen Zeitraum
    async function loadFlightsForPeriod(start, end, retryCount = 0) {
      const url = `https://api.weglide.org/v1/flight?club_id_in=${clubId}&contest=free&order_by=-scoring_date&scoring_date_start=${start}&scoring_date_end=${end}&not_scored=false&story=false&valid=false&skip=0&limit=100&include_story=true&include_stats=false&format=json`;
      
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'SG-Saentis-Soaring/1.0'
          }
        });
        
        if (!response.ok) {
          if (response.status === 429 && retryCount < 3) {
            // Rate limit - warte und versuche erneut
            console.log(`  ⏳ Rate limit erreicht, warte ${(retryCount + 1) * 2} Sekunden...`);
            await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
            return loadFlightsForPeriod(start, end, retryCount + 1);
          }
          throw new Error(`API responded with ${response.status}`);
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : [];
        
      } catch (error) {
        console.error(`Fehler beim Laden von ${start} bis ${end}:`, error.message);
        return [];
      }
    }
    
    // Start des Ladevorgangs
    const today = new Date();
    const intervals = generateMonthIntervals(startDate, today);
    
    console.log(`[API] Lade Flüge für ${intervals.length} Monate...`);
    
    const allFlights = [];
    const flightStats = {
      totalFlights: 0,
      monthsWithLimit: [],
      errorMonths: [],
      loadedMonths: 0
    };
    
    // Lade Monate in Batches
    const batchSize = 3;
    
    for (let i = 0; i < intervals.length; i += batchSize) {
      const batch = intervals.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (interval) => {
        console.log(`[API] Lade Monat ${interval.month}/${interval.year}`);
        
        let monthFlights = await loadFlightsForPeriod(interval.start, interval.end);
        
        // Wenn 100 Flüge erreicht wurden, lade wochenweise
        if (monthFlights.length === 100) {
          console.log(`  ⚠️ Limit erreicht für ${interval.month}/${interval.year} - lade wochenweise`);
          flightStats.monthsWithLimit.push(`${interval.month}/${interval.year}`);
          
          const weekIntervals = generateWeekIntervals(interval.year, interval.month);
          monthFlights = [];
          
          for (const week of weekIntervals) {
            const weekFlights = await loadFlightsForPeriod(week.start, week.end);
            monthFlights.push(...weekFlights);
            console.log(`    Woche ${week.start}: ${weekFlights.length} Flüge`);
            
            // Kleine Pause zwischen Wochen-Requests
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        
        console.log(`  ✓ ${interval.month}/${interval.year}: ${monthFlights.length} Flüge`);
        flightStats.loadedMonths++;
        
        return monthFlights;
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(flights => {
        allFlights.push(...flights);
        flightStats.totalFlights += flights.length;
      });
      
      // Pause zwischen Batches
      if (i + batchSize < intervals.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Duplikate entfernen
    const flightMap = new Map();
    allFlights.forEach(flight => {
      if (flight && flight.id) {
        flightMap.set(flight.id, flight);
      }
    });
    
    const uniqueFlights = Array.from(flightMap.values());
    
    // Nach Datum sortieren (neueste zuerst)
    uniqueFlights.sort((a, b) => {
      const dateA = new Date(a.scoring_date || a.takeoff_time);
      const dateB = new Date(b.scoring_date || b.takeoff_time);
      return dateB - dateA;
    });
    
    console.log(`[API] ✅ Erfolgreich ${uniqueFlights.length} eindeutige Flüge geladen`);
    
    // Response
    res.status(200).json({
      success: true,
      total: uniqueFlights.length,
      flights: uniqueFlights,
      metadata: {
        startDate: startDate,
        endDate: today.toISOString().split('T')[0],
        monthsLoaded: flightStats.loadedMonths,
        monthsTotal: intervals.length,
        monthsWithLimit: flightStats.monthsWithLimit,
        duplicatesRemoved: allFlights.length - uniqueFlights.length
      }
    });
    
  } catch (error) {
    console.error('[API] Fehler beim Laden der Club-Flüge:', error);
    res.status(500).json({ 
      success: false,
      error: 'Fehler beim Laden der Club-Flüge',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}