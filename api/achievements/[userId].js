// /api/achievements/[userId].js
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'userId ist erforderlich' 
      });
    }
    
    console.log(`[API] Lade Achievements für User ${userId}`);
    
    // KORRIGIERT: achievement/user/{userId}
    const url = `https://api.weglide.org/v1/achievement/user/${userId}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SG-Saentis-Soaring/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`WeGlide API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log(`[API] ${Array.isArray(data) ? data.length : 0} Achievements geladen`);
    
    res.status(200).json(data);
    
  } catch (error) {
    console.error('[API] Fehler beim Abrufen der Achievements:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Achievements',
      message: error.message
    });
  }
}