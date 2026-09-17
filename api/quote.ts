import type { VercelRequest, VercelResponse } from '@vercel/node';
import { marketData } from '../server/marketData.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol =
    typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol' });
  }
  if (symbol.length > 20 || !/^[A-Z0-9.-]+$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }

  try {
    const q = await marketData.quote(symbol);
    if (!q) {
      return res.status(404).json({ error: 'Quote unavailable for symbol' });
    }
    res.setHeader('Cache-Control', 'private, max-age=15');
    return res.status(200).json(q);
  } catch (err) {
    console.error('quote error', err);
    return res.status(502).json({ error: 'Market data provider unavailable' });
  }
}
