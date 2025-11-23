export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { path, endpoint, ...otherParams } = req.query;
        
        console.log('[Proxy] Request:', { path, endpoint, otherParams });

        const baseUrl = 'https://api.weglide.org/v1';
        let finalPath = '';
        let queryParams = { ...otherParams };

        // ==================== PATH ROUTING ====================
        
        // Flight Endpunkt (singular!)
        if (path === 'flight' || endpoint === 'flight') {
            finalPath = 'flight';
        }
        
        // Sprint Endpunkt
        else if (path === 'sprint' || endpoint === 'sprint') {
            finalPath = 'flight';
            queryParams.contest = 'sprint';
            queryParams.club_id_in = '1281';
            queryParams.order_by = '-scoring_date';
            queryParams.not_scored = 'false';
            queryParams.limit = queryParams.limit || '100';
            
            // Parameter-Konvertierung
            if (otherParams.user_id) {
                queryParams.user_id_in = otherParams.user_id;
                delete queryParams.user_id;
            }
            if (otherParams.season) {
                queryParams.season_in = otherParams.season;
                delete queryParams.season;
            }
        }
        
        // Direct path endpoints (user/, flightdetail/, etc.)
        else if (path && (
            path.startsWith('user/') || 
            path.startsWith('flightdetail/') || 
            path.startsWith('achievement/') || 
            path.startsWith('club/')
        )) {
            finalPath = path;
        }
        
        // Legacy endpoint support
        else if (endpoint === 'weglide') {
            finalPath = 'club/1281';
        }
        else if (endpoint === 'achievements' && otherParams.userId) {
            finalPath = `achievement/user/${otherParams.userId}`;
            delete queryParams.userId;
        }
        else if ((endpoint === 'flightdetail' || endpoint === 'flight') && otherParams.flightId) {
            finalPath = `flightdetail/${otherParams.flightId}`;
            delete queryParams.flightId;
        }
        
        // Fallback: use path as-is
        else if (path) {
            finalPath = path;
        }
        
        // Error: no path specified
        else {
            return res.status(400).json({ 
                error: 'path or endpoint parameter required' 
            });
        }

        // ==================== BUILD URL ====================
        
        const queryString = new URLSearchParams(queryParams).toString();
        const url = `${baseUrl}/${finalPath}${queryString ? '?' + queryString : ''}`;
        
        console.log('[Proxy] Fetching:', url);

        // ==================== FETCH WITH BROWSER HEADERS ====================
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://weglide.org/',
                'Origin': 'https://weglide.org',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        console.log('[Proxy] Response status:', response.status);

        // ==================== ERROR HANDLING ====================
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Proxy] Error response:', errorText);
            
            return res.status(response.status).json({
                error: `WeGlide API error: ${response.status}`,
                statusText: response.statusText,
                url: url,
                details: errorText
            });
        }

        // ==================== SUCCESS RESPONSE ====================
        
        const data = await response.json();
        
        // Cache für Performance (30 Sekunden)
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
        
        return res.status(200).json(data);

    } catch (error) {
        console.error('[Proxy] Exception:', error);
        return res.status(500).json({
            error: 'Proxy server error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}