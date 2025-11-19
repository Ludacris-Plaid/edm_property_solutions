import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors()); // allow frontend to call it
const PORT = 3000;

// Endpoint for Zillow search
app.get('/api/zillow', async (req, res) => {
  const location = req.query.location;
  if (!location) return res.status(400).json({ error: 'Location required' });

  if (!process.env.RAPIDAPI_KEY) {
    return res.status(500).json({
      error: 'RAPIDAPI_KEY is not configured on the server',
      details: 'Create a .env with RAPIDAPI_KEY=your_key and restart the server.'
    });
  }

  try {
    const host = process.env.RAPIDAPI_HOST || 'real-time-zillow-data.p.rapidapi.com';
    const params = new URLSearchParams();
    params.set('location', location);

    // Optional passthrough filters from querystring
    const { home_status, sort, listing_type, beds_min, beds_max, price_min, price_max } = req.query;
    params.set('home_status', home_status || 'FOR_SALE');
    params.set('sort', sort || 'DEFAULT');
    params.set('listing_type', listing_type || 'BY_AGENT');
    if (beds_min) params.set('beds_min', beds_min);
    if (beds_max) params.set('beds_max', beds_max);
    if (price_min) params.set('price_min', price_min);
    if (price_max) params.set('price_max', price_max);

    const url = `https://${host}/search?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': host
      }
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }

    if (!response.ok) {
      const msg = (data && data.message) || (data && data.error) || `RapidAPI error: ${response.status}`;
      return res.status(response.status).json({ error: msg });
    }

    // Normalize various possible shapes into {results: []}
    const results = (data && (data.results || data.props || data.properties || data.data)) || [];
    return res.json({ results });

  } catch (err) {
    console.error('Zillow proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch Zillow data', details: err.message });
  }
});

// Endpoint for Zillow detail by zpid
app.get('/api/zillow/detail', async (req, res) => {
  const zpid = req.query.zpid;
  if (!zpid) return res.status(400).json({ error: 'zpid required' });
  if (!process.env.RAPIDAPI_KEY) {
    return res.status(500).json({ error: 'RAPIDAPI_KEY is not configured on the server' });
  }
  try {
    const host = process.env.RAPIDAPI_HOST || 'real-time-zillow-data.p.rapidapi.com';
    const url = `https://${host}/property?zpid=${encodeURIComponent(zpid)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': host
      }
    });
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    if (!response.ok) {
      const msg = (data && (data.message || data.error)) || `RapidAPI error: ${response.status}`;
      return res.status(response.status).json({ error: msg });
    }
    res.json(data);
  } catch (err) {
    console.error('Zillow detail proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch Zillow detail', details: err.message });
  }
});

// Fallback: scrape Zillow detail page to extract relative time
app.get('/api/zillow/scrape-time', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await response.text();
    if (!response.ok) return res.status(response.status).json({ error: 'Failed to load detail page' });

    // Helper to convert a number+unit into minutes
    const toMinutes = (num, unit) => {
      if (!num) return 0;
      const u = String(unit || '').toLowerCase();
      if (/(min|minute|mins)/.test(u)) return num;
      if (/(hr|hour|hrs)/.test(u)) return num * 60;
      if (/(day|days)/.test(u)) return num * 24 * 60;
      return 0;
    };

    // 1) Try embedded JSON (Next.js data or shared data)
    let minutes = 0;
    const jsonMatches = html.match(/<script[^>]*>\s*window\.__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/) ||
                        html.match(/<script[^>]*data-zrr-shared-data-key="initial-data"[^>]*>\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (jsonMatches && jsonMatches[1]) {
      try {
        const data = JSON.parse(jsonMatches[1]);
        const findInObj = (obj) => {
          if (!obj || typeof obj !== 'object') return null;
          for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (typeof v === 'string' && /time.*zillow/i.test(k)) return v;
            if (typeof v === 'number' && /time.*zillow.*(min|hour|day)?/i.test(k)) return v; // generic catch
            if (typeof v === 'object') {
              const r = findInObj(v); if (r) return r;
            }
          }
          return null;
        };
        const any = findInObj(data);
        if (typeof any === 'number') minutes = any; // assume minutes
        else if (typeof any === 'string') {
          const m = any.match(/(\d+(?:\.\d+)?)/); const num = m?Number(m[1]):0;
          const unitMatch = any.match(/(min|minute|mins|hr|hour|hrs|day|days)/i);
          const unit = unitMatch ? unitMatch[1] : 'hour';
          minutes = toMinutes(Math.round(num), unit);
        }
      } catch { /* ignore JSON parse */ }
    }

    // 2) Fallback: regex scan visible text (no 'ago' requirement)
    if (!minutes) {
      const m = html.match(/(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)/i);
      if (m) {
        const num = Number(m[1]);
        const unit = m[2];
        minutes = toMinutes(num, unit);
      }
    }

    return res.json({ minutes: minutes || null });
  } catch (err) {
    console.error('Scrape time error:', err);
    res.status(500).json({ error: 'Scrape failed', details: err.message });
  }
});

app.listen(PORT, () => console.log(`Proxy running on http://localhost:${PORT}`));
