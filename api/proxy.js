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
    
    // NEU: Spezialbehandlung für flights Endpunkt
    if (path === 'flights' || endpoint === 'flights') {
      finalPath = 'flights';
      // Stelle sicher, dass alle Parameter korrekt sind
      if (otherParams.user_id_in) {
        queryParams.user_id_in = otherParams.user_id_in;
      }
      if (otherParams.season_in) {
        queryParams.season_in = otherParams.season_in;
      }
      if (otherParams.date_from) {
        queryParams.date_from = otherParams.date_from;
      }
      if (otherParams.date_to) {
        queryParams.date_to = otherParams.date_to;
      }
      if (otherParams.limit) {
        queryParams.limit = otherParams.limit;
      }
    }
    // NEU: Sprint Endpunkt
    else if (path === 'sprint' || endpoint === 'sprint') {
      finalPath = 'sprint';
    }
    // NEU: User Endpunkt
    else if (path && path.startsWith('user/')) {
      finalPath = path;
    }
    // Standard path handling
    else if (path) {
      // Korrigiere automatisch flight/ zu flightdetail/
      if (path.startsWith('flight/') && !path.includes('?')) {
        const flightId = path.replace('flight/', '');
        finalPath = `flightdetail/${flightId}`;
      } else if (path.startsWith('flightdetail/')) {
        finalPath = path;
      } else if (path.startsWith('achievement/user/')) {
        finalPath = path;
      } else if (path.startsWith('club/')) {
        finalPath = path;
      } else {
        finalPath = path;
      }
    } else if (endpoint) {
      // Legacy Support für endpoint Parameter
      switch(endpoint) {
        case 'weglide':
          finalPath = 'club/1281';
          queryParams.contest = queryParams.contest || 'free';
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
      
      // Bei 404 könnte es sein, dass der Endpunkt nicht existiert
      if (response.status === 404) {
        console.error(`Endpunkt existiert nicht: ${url}`);
      }
      
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