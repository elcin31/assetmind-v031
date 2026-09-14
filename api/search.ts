import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireActiveInvite } from '../server/auth';
import { marketData } from '../server/marketData';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const invite = await requireActiveInvite(req, res);
  if (!invite) return;

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    return res.status(400).json({ error: 'Missing or empty query parameter q' });
  }
  if (q.length > 50) {
    return res.status(400).json({ error: 'Query too long' });
  }

  try {
    const results = await marketData.search(q);
    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({ results });
  } catch (err) {
    console.error('search error', err);
    return res.status(502).json({ error: 'Market data provider unavailable' });
  }
}
