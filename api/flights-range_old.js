// /api/flights-range.js
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { 
      user_id_in, 
      date_from, 
      date_to, 
      limit = '100',
      contest = 'free',
      order_by = '-scoring_date'
    } = req.query;
    
    // Validierung
    if (!user_id_in) {
      return res.status(400).json({ 
        error: 'user_id_in ist erforderlich' 
      });
    }
    
    if (!date_from || !date_to) {
      return res.status(400).json({ 
        error: 'date_from und date_to sind erforderlich' 
      });
    }
    
    console.log(`[API] Lade Flüge für User ${user_id_in} von ${date_from} bis ${date_to}`);
    
    // WeGlide API URL mit Datumsbereichen
    const url = `https://api.weglide.org/v1/flight?` + new URLSearchParams({
      user_id_in,
      scoring_date_start: date_from,
      scoring_date_end: date_to,
      contest,
      order_by,
      not_scored: 'false',
      story: 'false',
      valid: 'false',
      skip: '0',
      limit,
      format: 'json'
    });
    
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
    
    console.log(`[API] ${Array.isArray(data) ? data.length : 0} Flüge geladen`);
    
    res.status(200).json(data);
    
  } catch (error) {
    console.error('[API] Fehler beim Abrufen der Flug-Daten:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Flug-Daten',
      message: error.message
    });
  }
}