// /api/proxy.js
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Debug logging
    console.log('Proxy request:', req.url);
    console.log('Query params:', req.query);
    
    // Hole den path Parameter
    const { path, endpoint, ...otherParams } = req.query;
    
    // Basis-URL für WeGlide
    const baseUrl = 'https://api.weglide.org/v1';
    let finalPath = '';
    let queryParams = { ...otherParams };
    
    if (path) {
      // Neuer universeller Proxy-Modus
      // Korrigiere automatisch flight/ zu flightdetail/ wenn es eine ID enthält
      if (path.startsWith('flight/') && !path.includes('?')) {
        // Es ist wahrscheinlich eine Flugdetail-Anfrage
        const flightId = path.replace('flight/', '');
        finalPath = `flightdetail/${flightId}`;
      } else {
        finalPath = path;
      }
    } else if (endpoint) {
      // Legacy Support für endpoint Parameter
      switch(endpoint) {
        case 'weglide':
          finalPath = 'club/1281';
          queryParams.contest = 'free';
          break;
          
        case 'achievements':
          if (otherParams.userId) {
            finalPath = `achievement/user/${otherParams.userId}`;
            delete queryParams.userId;
          } else {
            res.status(400).json({ error: 'userId required for achievements' });
            return;
          }
          break;
          
        case 'flightdetail':
        case 'flight':
          if (otherParams.flightId) {
            // KORRIGIERT: flightdetail statt flight
            finalPath = `flightdetail/${otherParams.flightId}`;
            delete queryParams.flightId;
          } else {
            res.status(400).json({ error: 'flightId required for flight details' });
            return;
          }
          break;
          
        default:
          res.status(404).json({ error: `Unknown endpoint: ${endpoint}` });
          return;
      }
    } else {
      res.status(400).json({ error: 'Either path or endpoint parameter is required' });
      return;
    }
    
    // Baue die finale URL
    const queryString = new URLSearchParams(queryParams).toString();
    const url = `${baseUrl}/${finalPath}${queryString ? '?' + queryString : ''}`;
    
    console.log('Proxying to:', url);
    
    // Mache den Request
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SG-Saentis-Soaring/1.0'
      }
    });
    
    // Log response status
    console.log('WeGlide response status:', response.status);
    
    // Hole die Daten
    let data;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Falls keine JSON-Antwort, gib den Text zurück
      data = await response.text();
      console.log('Non-JSON response:', data);
    }
    
    // Prüfe ob Response OK ist
    if (!response.ok) {
      console.error(`WeGlide API error: ${response.status} ${response.statusText}`);
      res.status(response.status).json({
        error: `WeGlide API error: ${response.status}`,
        details: data,
        url: url,
        statusText: response.statusText
      });
      return;
    }
    
    // Erfolgreiche Antwort
    res.status(200).json(data);
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
// In /api/proxy.js - Fügen Sie diese neue Route hinzu:
async function handleClubFlightsComplete(req, res) {
  const { clubId = 1281, startDate = '2023-06-01' } = req.query;
  
  try {
    console.log(`📋 Lade alle Club-Flüge seit ${startDate}...`);
    
    // Lade zuerst alle Club-Mitglieder
    const clubResponse = await fetch(`https://api.weglide.org/v1/club/${clubId}?contest=free`);
    const clubData = await clubResponse.json();
    
    if (!clubData.user || !Array.isArray(clubData.user)) {
      throw new Error('Keine Mitgliederdaten gefunden');
    }
    
    const members = clubData.user;
    const allFlights = [];
    const startDateObj = new Date(startDate);
    const endDate = new Date();
    
    // Lade Flüge für jeden User
    for (const member of members) {
      const userFlights = await loadUserFlightsInRange(
        member.id, 
        startDateObj, 
        endDate
      );
      
      // Füge User-Info zu jedem Flug hinzu
      userFlights.forEach(flight => {
        flight.user = member; // Vollständige User-Info
      });
      
      allFlights.push(...userFlights);
    }
    
    // Sortiere nach Datum (neueste zuerst)
    allFlights.sort((a, b) => {
      const dateA = new Date(a.scoring_date || a.takeoff_time);
      const dateB = new Date(b.scoring_date || b.takeoff_time);
      return dateB - dateA;
    });
    
    // Metadata hinzufügen
    const metadata = {
      clubId: clubId,
      memberCount: members.length,
      flightCount: allFlights.length,
      dateRange: {
        from: startDate,
        to: endDate.toISOString().split('T')[0],
        oldestFlight: allFlights.length > 0 ? allFlights[allFlights.length - 1].scoring_date : null,
        newestFlight: allFlights.length > 0 ? allFlights[0].scoring_date : null
      }
    };
    
    res.status(200).json({
      flights: allFlights,
      metadata: metadata,
      members: members
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Laden der Club-Flüge:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Club-Flüge',
      message: error.message 
    });
  }
}

// Hilfsfunktion für adaptives Laden
async function loadUserFlightsInRange(userId, startDate, endDate) {
  const allFlights = [];
  
  async function loadRange(from, to, depth = 0) {
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    
    try {
      const params = new URLSearchParams({
        user_id_in: userId,
        date_from: fromStr,
        date_to: toStr,
        limit: '100'
      });
      
      const response = await fetch(`https://api.weglide.org/v1/flights?${params}`);
      
      if (!response.ok) {
        throw new Error(`API Fehler: ${response.status}`);
      }
      
      const flights = await response.json();
      
      if (!Array.isArray(flights)) return;
      
      // Wenn genau 100 Flüge = Limit erreicht, Zeitbereich teilen
      if (flights.length === 100) {
        const daysDiff = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 1) {
          const midDate = new Date(from.getTime() + (to - from) / 2);
          
          // Rekursiv beide Hälften laden
          await loadRange(from, midDate, depth + 1);
          await loadRange(new Date(midDate.getTime() + 86400000), to, depth + 1);
          return;
        }
      }
      
      allFlights.push(...flights);
      
    } catch (error) {
      console.error(`Fehler beim Laden von Flügen für User ${userId}:`, error);
    }
  }
  
  await loadRange(startDate, endDate);
  return allFlights;
}

// In der Haupt-Handler-Funktion den neuen Endpunkt hinzufügen:
if (path === 'club-flights-complete') {
  return handleClubFlightsComplete(req, res);
}