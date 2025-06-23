export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const response = await fetch('https://api.weglide.org/v1/club/1281?contest=free', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SGSaentisCup/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`WeGlide API error: ${response.status}`);
    }
    
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('WeGlide API Fehler:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Daten',
      details: error.message 
    });
  }
}