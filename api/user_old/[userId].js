// /api/user/[userId].js
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
    
    // Validierung
    if (!userId) {
      return res.status(400).json({ 
        error: 'User ID ist erforderlich',
        message: 'Bitte geben Sie eine gültige User ID an'
      });
    }
    
    // Prüfe ob userId eine Zahl ist
    if (isNaN(parseInt(userId))) {
      return res.status(400).json({ 
        error: 'Ungültige User ID',
        message: 'Die User ID muss eine Zahl sein'
      });
    }
    
    console.log(`[API] Lade User-Details für ID: ${userId}`);
    
    // WeGlide API Anfrage
    const response = await fetch(`https://api.weglide.org/v1/user/${userId}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SG-Saentis-Soaring/1.0'
      }
    });
    
    // Fehlerbehandlung für verschiedene Status-Codes
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ 
          error: 'User nicht gefunden',
          message: `Kein User mit ID ${userId} gefunden`,
          userId: userId
        });
      }
      
      if (response.status === 429) {
        return res.status(429).json({ 
          error: 'Rate limit erreicht',
          message: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut',
          retryAfter: response.headers.get('Retry-After') || '60'
        });
      }
      
      throw new Error(`WeGlide API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Zusätzliche Informationen hinzufügen
    const enrichedData = {
      ...data,
      _meta: {
        requestedAt: new Date().toISOString(),
        userId: userId,
        source: 'WeGlide API v1'
      }
    };
    
    // Cache-Control Header für Browser-Caching
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    
    console.log(`[API] ✅ User-Details für ID ${userId} erfolgreich geladen`);
    res.status(200).json(enrichedData);
    
  } catch (error) {
    console.error(`[API] ❌ Fehler beim Abrufen der User-Details für ${req.query.userId}:`, error);
    
    // Detaillierte Fehlerantwort
    const errorResponse = {
      error: 'Interner Serverfehler',
      message: 'Fehler beim Abrufen der User-Daten von WeGlide',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      userId: req.query.userId,
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(errorResponse);
  }
}