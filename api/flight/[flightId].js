// /api/flight/[flightId].js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { flightId } = req.query;
    
    if (!flightId) {
      return res.status(400).json({ 
        error: 'Flight ID ist erforderlich' 
      });
    }
    
    console.log(`[API] Lade Flugdetails für ID: ${flightId}`);
    
    const response = await fetch(`https://api.weglide.org/v1/flight/${flightId}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SG-Saentis-Soaring/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`WeGlide API error: ${response.status}`);
    }
    
    const data = await response.json();
    res.status(200).json(data);
    
  } catch (error) {
    console.error(`[API] Fehler beim Abrufen der Flugdetails für ${req.query.flightId}:`, error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Flugdetails',
      message: error.message,
      flightId: req.query.flightId
    });
  }
}