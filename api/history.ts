import type { VercelRequest, VercelResponse } from '@vercel/node';
import { marketData, type HistoryPeriod } from '../server/marketData.js';

const VALID_PERIODS: HistoryPeriod[] = ['1m', '3m', '6m', '1y', '2y', '5y'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol =
    typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
  const periodRaw =
    typeof req.query.period === 'string' ? req.query.period.trim().toLowerCase() : '1y';

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol' });
  }
  if (symbol.length > 20 || !/^[A-Z0-9.\-]+$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }
  if (!VALID_PERIODS.includes(periodRaw as HistoryPeriod)) {
    return res.status(400).json({ error: 'Invalid period' });
  }

  const period = periodRaw as HistoryPeriod;

  try {
    const bars = await marketData.history(symbol, period);
    if (bars.length === 0) {
      return res.status(404).json({ error: 'Historical data unavailable', bars: [] });
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({ symbol, period, bars });
  } catch (err) {
    console.error('history error', err);
    return res.status(502).json({ error: 'Market data provider unavailable' });
  }
}
