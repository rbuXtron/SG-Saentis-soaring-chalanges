export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { endpoint, ...params } = req.query;
  
  // Basis-URL für WeGlide
  const baseUrl = 'https://api.weglide.org/v1';
  
  // Endpoint-Konstruktion basierend auf dem Typ
  let apiPath = '';
  
  switch(endpoint) {
    case 'weglide':
      apiPath = '/club/1281?contest=free';
      break;
      
    case 'flights':
      apiPath = '/flight';
      break;
      
    case 'season_flights':
      apiPath = '/flight';
      break;
      
    case 'sprint':
      apiPath = '/flight';
      break;
      
    case 'achievements':
      // KORRIGIERT: achievement/user/{userId}
      if (params.userId) {
        apiPath = `/achievement/user/${params.userId}`;
      } else {
        res.status(400).json({ error: 'userId required for achievements' });
        return;
      }
      break;
      
    case 'flightdetail':
      // Flight Detail braucht flightId im Pfad
      if (params.flightId) {
        apiPath = `/flight/${params.flightId}`;
      } else {
        res.status(400).json({ error: 'flightId required for flight details' });
        return;
      }
      break;
      
    case 'userflights':
      // User Flights
      if (params.userId) {
        apiPath = `/flight`;
        // Füge user_id_in als Query-Parameter hinzu
        params.user_id_in = params.userId;
        delete params.userId;
      } else {
        res.status(400).json({ error: 'userId required for user flights' });
        return;
      }
      break;
      
    default:
      res.status(404).json({ error: 'Endpoint not found' });
      return;
  }

  try {
    // Query-Parameter erstellen (außer userId und flightId, die bereits im Pfad sind)
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (key !== 'userId' && key !== 'flightId') {
        queryParams.append(key, value);
      }
    });

    const queryString = queryParams.toString();
    const url = `${baseUrl}${apiPath}${queryString ? (apiPath.includes('?') ? '&' : '?') + queryString : ''}`;
    
    console.log('Proxying to:', url);

    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SG-Saentis-Soaring/1.0'
      }
    });

    // Prüfe ob die Antwort OK ist
    if (!response.ok) {
      console.error(`WeGlide API error: ${response.status} ${response.statusText}`);
      
      // Versuche Fehlerdetails zu lesen
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: response.statusText };
      }
      
      res.status(response.status).json({
        error: `WeGlide API error: ${response.status}`,
        details: errorData
      });
      return;
    }

    const data = await response.json();
    res.status(response.status).json(data);
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy server error',
      message: error.message 
    });
  }
}