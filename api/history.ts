import type { VercelRequest, VercelResponse } from '@vercel/node';
import { marketData, HistoryProviderError, type HistoryPeriod } from '../server/marketData.js';

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
    const result = await marketData.history(symbol, period, req.query.refresh === '1');
    res.setHeader('Cache-Control', 'no-store');
    if (result.warnings.length) console.warn('history fallback', { symbol, period, provider: result.provider, failures: result.warnings });
    return res.status(200).json({ symbol, period, ...result });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    if (err instanceof HistoryProviderError) {
      console.error('history provider failure', { symbol, period, failures: err.failures });
      const last = err.failures.at(-1)!;
      const status = last.status === 401 || last.status === 403 || last.status === 429 ? last.status : last.code === 'timeout' ? 504 : 502;
      if (status === 429) res.setHeader('Retry-After', '30');
      return res.status(status).json({ symbol, period, error: err.message, code: last.code, failures: err.failures });
    }
    console.error('history unexpected error');
    return res.status(502).json({ symbol, period, error: 'Market data provider unavailable', code: 'provider_unavailable' });
  }
}
