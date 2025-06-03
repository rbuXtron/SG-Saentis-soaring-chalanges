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
  
  // Mapping der Endpoints
  const endpoints = {
    'weglide': '/club/1281?contest=free',
    'flights': '/flights',
    'season_flights': '/season_flights',
    'sprint': '/sprint',
    'achievements': `/user/${params.userId}/achievements`,
    'flightdetail': `/flight/${params.flightId}`,
    'userflights': `/user/${params.userId}/flights`
  };

  const apiPath = endpoints[endpoint];
  if (!apiPath) {
    res.status(404).json({ error: 'Endpoint not found' });
    return;
  }

  try {
    // Query-Parameter erstellen
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (key !== 'userId' && key !== 'flightId') {
        queryParams.append(key, value);
      }
    });

    const queryString = queryParams.toString();
    const url = `${baseUrl}${apiPath}${queryString ? (apiPath.includes('?') ? '&' : '?') + queryString : ''}`;
    
    console.log('Fetching:', url);

    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SG-Saentis-Soaring/1.0'
      }
    });

    const data = await response.json();
    
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}