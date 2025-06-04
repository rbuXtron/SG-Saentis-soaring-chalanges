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
    // Hole den path Parameter (alles nach /api/proxy/)
    const { path, ...queryParams } = req.query;
    
    if (!path) {
      // Legacy Support für endpoint Parameter
      const { endpoint, ...params } = req.query;
      
      // Mapping der alten Endpoints
      let apiPath = '';
      
      switch(endpoint) {
        case 'weglide':
          apiPath = 'club/1281';
          queryParams.contest = 'free';
          break;
          
        case 'achievements':
          if (params.userId) {
            apiPath = `achievement/user/${params.userId}`;
            delete params.userId;
          }
          break;
          
        case 'flightdetail':
          if (params.flightId) {
            apiPath = `flight/${params.flightId}`;
            delete params.flightId;
          }
          break;
          
        default:
          apiPath = endpoint;
      }
      
      // Baue die WeGlide URL
      const baseUrl = 'https://api.weglide.org/v1';
      const queryString = new URLSearchParams({...queryParams, ...params}).toString();
      const url = `${baseUrl}/${apiPath}${queryString ? '?' + queryString : ''}`;
      
      console.log('Legacy proxy to:', url);
      
      const response = await fetch(url, {
        method: req.method,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SG-Saentis-Soaring/1.0'
        }
      });
      
      const data = await response.json();
      res.status(response.status).json(data);
      
    } else {
      // Neuer universeller Proxy-Modus
      // Beispiel: /api/proxy?path=flight/123456
      // Beispiel: /api/proxy?path=achievement/user/824
      
      const baseUrl = 'https://api.weglide.org/v1';
      const queryString = new URLSearchParams(queryParams).toString();
      const url = `${baseUrl}/${path}${queryString ? '?' + queryString : ''}`;
      
      console.log('Universal proxy to:', url);
      
      const response = await fetch(url, {
        method: req.method,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SG-Saentis-Soaring/1.0'
        },
        // Bei POST/PUT Requests den Body weiterleiten
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
      });
      
      // Response Status prüfen
      if (!response.ok) {
        console.error(`WeGlide API error: ${response.status} ${response.statusText}`);
        
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: response.statusText };
        }
        
        res.status(response.status).json({
          error: `WeGlide API error: ${response.status}`,
          details: errorData,
          url: url
        });
        return;
      }
      
      const data = await response.json();
      res.status(response.status).json(data);
    }
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}