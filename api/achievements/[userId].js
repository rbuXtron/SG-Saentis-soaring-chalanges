export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { userId } = req.query;
    const response = await fetch(`https://api.weglide.org/v1/achievement/user/${userId}`);
    const data = await response.json();
    
    res.status(200).json(data);
  } catch (error) {
    console.error(`Fehler beim Abrufen der Achievement-Daten für Benutzer ${req.query.userId}:`, error);
    res.status(500).json({ error: 'Fehler bei der WeGlide API' });
  }
}