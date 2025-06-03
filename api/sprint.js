export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { user_id_in, limit = '100' } = req.query;
    const currentYear = new Date().getFullYear();
    
    if (!user_id_in || isNaN(parseInt(user_id_in))) {
      return res.status(400).json({ error: 'Ungültige Benutzer-ID' });
    }
    
    const speedUrl = `https://api.weglide.org/v1/flight?user_id_in=${user_id_in}&season_in=${currentYear}&contest=sprint&order_by=-scoring_date&not_scored=false&story=false&valid=false&skip=0&limit=${limit}&format=json`;
    
    console.log('Sprint API URL:', speedUrl); // Debug
    
    const response = await fetch(speedUrl);
    
    if (!response.ok) {
      console.error('WeGlide API Error:', response.status, response.statusText);
      throw new Error(`WeGlide API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log(`Sprint-Daten für User ${user_id_in}: ${data.length || 0} Einträge`);
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Fehler beim Abrufen der Speed-Daten:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Speed-Daten',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}