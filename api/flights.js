export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { user_id_in, season_in = '2025', limit = '100' } = req.query;
    
    const url = `https://api.weglide.org/v1/flight?season_in=${season_in}&user_id_in=${user_id_in}&contest=free&order_by=-scoring_date&not_scored=false&story=false&valid=false&skip=0&limit=${limit}&format=json`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Fehler beim Abrufen der Flug-Daten:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Flug-Daten' });
  }
}