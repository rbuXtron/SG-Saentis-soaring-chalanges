// /api/flightdetail/[flightId].js
export default async function handler(req, res) {
  // CORS Headers
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
    
    // KORRIGIERT: Verwende /v1/flightdetail/ statt /v1/flight/
    const response = await fetch(`https://api.weglide.org/v1/flightdetail/${flightId}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SG-Saentis-Soaring/1.0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ 
          error: 'Flug nicht gefunden',
          message: `Kein Flug mit ID ${flightId} gefunden`,
          flightId: flightId
        });
      }
      
      if (response.status === 429) {
        return res.status(429).json({ 
          error: 'Rate limit erreicht',
          message: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut',
          retryAfter: response.headers.get('Retry-After') || '60'
        });
      }
      
      throw new Error(`WeGlide API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Log achievements für Debugging
    if (data.achievements && data.achievements.length > 0) {
      console.log(`  ✅ ${data.achievements.length} Achievements gefunden`);
      data.achievements.forEach(achievement => {
        console.log(`    - ${achievement.badge_id}: ${achievement.name || 'N/A'} (Value: ${achievement.value})`);
      });
    } else {
      console.log(`  ℹ️ Keine Achievements in diesem Flug`);
    }
    
    // Cache-Control für bessere Performance
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    
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