import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  diagnoseFinnhubHistory,
  marketData,
  providerFailure,
  type HistoryPeriod,
} from '../server/marketData.js';

const VALID_PERIODS: HistoryPeriod[] = ['1m', '3m', '6m', '1y', '2y', '5y'];

function responseStatus(code: string, upstreamStatus: number | null): number {
  if (code === 'SYMBOL_NOT_FOUND') return 404;
  if (code === 'PROVIDER_RATE_LIMIT' || upstreamStatus === 429) return 429;
  if (code === 'PROVIDER_TIMEOUT') return 504;
  return 502;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
  const periodRaw = typeof req.query.period === 'string' ? req.query.period.trim().toLowerCase() : '1y';
  const diagnostics = req.query.diagnostics === '1';

  if (!symbol) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'Missing symbol' });
  }
  if (symbol.length > 20 || !/^[A-Z0-9.-]+$/.test(symbol)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'Invalid symbol format' });
  }
  if (!VALID_PERIODS.includes(periodRaw as HistoryPeriod)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'Invalid period' });
  }

  const period = periodRaw as HistoryPeriod;

  try {
    const result = await marketData.history(symbol, period);
    const finnhub = diagnostics ? await diagnoseFinnhubHistory(symbol, period) : undefined;
    const bars = result.bars;
    const duplicateDates = bars.length - new Set(bars.map((bar) => bar.date)).size;
    const sorted = bars.every((bar, index) => index === 0 || bar.date > bars[index - 1].date);
    const meta = {
      count: bars.length,
      firstDate: bars[0]?.date ?? null,
      lastDate: bars.length ? bars[bars.length - 1].date : null,
      duplicateDates,
      sorted,
      valuationCount: result.valuationBars.length,
      splitCount: result.splits.length,
    };
    res.setHeader('Cache-Control', diagnostics ? 'no-store' : 'private, max-age=300');
    return res.status(200).json({
      symbol,
      period,
      provider: result.provider,
      priceType: result.priceType,
      valuationPriceType: result.valuationPriceType,
      meta,
      ...(finnhub ? { diagnostics: { finnhub } } : {}),
      bars,
      valuationBars: result.valuationBars,
      splits: result.splits,
    });
  } catch (error) {
    const failure = providerFailure(error);
    console.error('history provider error', failure ?? error);
    res.setHeader('Cache-Control', 'no-store');
    if (!failure) {
      return res.status(502).json({ error: 'Market data provider unavailable', code: 'PROVIDER_UNKNOWN', retryable: true, bars: [] });
    }
    return res.status(responseStatus(failure.code, failure.upstreamStatus)).json({
      error: failure.message,
      code: failure.code,
      provider: failure.provider,
      upstreamStatus: failure.upstreamStatus,
      retryable: failure.retryable,
      bars: [],
    });
  }
}
