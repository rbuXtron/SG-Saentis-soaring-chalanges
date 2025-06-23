export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { season_in = '2025' } = req.query;
    const url = `https://api.weglide.org/v1/flight?season_in=${season_in}&club_id_in=1281`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Fehler beim Abrufen der Saison-Flug-Daten:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Saison-Flug-Daten' });
  }
}