import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHistory, historyStart, HistoryProviderError } from '../server/historyProvider';
import handler from '../api/history';
import { marketData } from '../server/marketData';
import { loadHistory } from '../src/analytics/historyCache';
import { normalizePriceHistory } from '../src/utils/priceHistory';
import { correlationMatrix } from '../src/math/correlation';
import { performanceMetrics, datedReturns } from '../src/math/performance';
import { reconstructPortfolioHistory } from '../src/math/portfolioHistory';
import { annualToDaily, volatility, mean } from '../src/math/statistics';
import { sharpeRatio } from '../src/math/ratios';
import { rollingMetric } from '../src/math/rolling';
import { benchmarkMetrics } from '../src/math/benchmark';
import { riskContributions } from '../src/math/riskContribution';
import { buildCurrentHoldingsRiskProxy } from '../src/math/returns';
import { pct, numeric } from '../src/utils/analyticsFormat';
import type { HistoryBar, Transaction, Position } from '../src/types';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Deterministic fixture ONLY for automated tests. Never used by the application.
function fixture(): HistoryBar[] {
  const bars: HistoryBar[] = [];
  for (let day = 0; day < 1826; day++) {
    const d = new Date(Date.UTC(2021, 8, 16 + day));
    if ([0, 6].includes(d.getUTCDay())) continue;
    bars.push({ date: d.toISOString().slice(0, 10), close: 100 * Math.exp(day * 0.0002 + Math.sin(day * 0.4) * 0.02) });
  }
  return bars;
}
const bars = fixture();
const now = new Date('2026-09-16T12:00:00Z');
const tx = (symbol: string, date = bars[0].date, id = symbol): Transaction => ({ id, portfolio_id: 'test', symbol, type: 'BUY', quantity: 1, price: 100, currency: 'USD', timestamp: `${date}T00:00:00Z`, created_at: `${date}T00:00:00Z` });
const response = (status: number, data: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const candles = { s: 'ok', t: bars.map(b => Date.parse(b.date) / 1000), c: bars.map(b => b.close) };
const yahoo = { chart: { result: [{ timestamp: candles.t, indicators: { quote: [{ close: candles.c }], adjclose: [{ adjclose: candles.c.map(c => c / 2) }] } }], error: null } };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('server history pipeline', () => {
  it('returns >1000 normalized bars for five years and supports every period', async () => {
    vi.stubEnv('FINNHUB_API_KEY', 'unit-test');
    const fetch = vi.fn().mockResolvedValue(response(200, candles)); vi.stubGlobal('fetch', fetch);
    const data = await fetchHistory(' aapl ', '5y', now);
    expect(data.bars.length).toBeGreaterThan(1000);
    expect(data.provider).toBe('finnhub');
    expect(fetch.mock.calls[0][0]).toContain('symbol=AAPL');
    expect(volatility(datedReturns(data.bars).map(r => r.value))).not.toBeNull();
    expect(sharpeRatio(datedReturns(data.bars).map(r => r.value), .04)).not.toBeNull();
    for (const period of ['1m', '3m', '6m', '1y', '2y', '5y'] as const) {
      const result = await fetchHistory('AAPL', period, now);
      expect(result.bars[0].date >= historyStart(period, now).toISOString().slice(0, 10)).toBe(true);
    }
  });
  it('falls back on 403 without mixing dividend-adjusted and close series', async () => {
    vi.stubEnv('FINNHUB_API_KEY', 'unit-test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(403)).mockResolvedValueOnce(response(200, yahoo)));
    const data = await fetchHistory('AAPL', '5y', now);
    expect(data.provider).toBe('yahoo');
    expect(data.priceBasis).toBe('split-adjusted-close');
    expect(data.bars[0].close).toBe(bars[0].close);
    expect(data.warnings).toEqual([{ provider: 'finnhub', code: 'plan_restriction', status: 403 }]);
  });
  it.each([401, 403, 429, 500])('preserves provider HTTP %i', async status => {
    vi.stubEnv('FINNHUB_API_KEY', 'unit-test'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status)));
    await expect(fetchHistory('AAPL', '5y', now)).rejects.toMatchObject({ failures: [expect.objectContaining({ status }), expect.objectContaining({ status })] });
  });
  it('rejects empty and malformed history instead of caching success', async () => {
    vi.stubEnv('FINNHUB_API_KEY', 'unit-test');
    const fetch = vi.fn().mockResolvedValueOnce(response(200, { s: 'no_data' })).mockResolvedValueOnce(response(200, { chart: { result: [{ timestamp: [], indicators: { quote: [{ close: [] }] } }] } }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchHistory('AAPL', '5y', now)).rejects.toMatchObject({ failures: [expect.objectContaining({ code: 'empty_history' }), expect.objectContaining({ code: 'empty_history' })] });
    fetch.mockResolvedValue(response(200, { s: 'ok', t: [1, 2], c: [100] }));
    await expect(fetchHistory('AAPL', '5y', now)).rejects.toBeInstanceOf(HistoryProviderError);
  });
  it.each([401, 429])('API and frontend preserve HTTP %i and retry failed requests', async status => {
    const code = status === 401 ? 'authorization' : 'rate_limit';
    vi.spyOn(marketData, 'history').mockRejectedValue(new HistoryProviderError([{ provider: 'yahoo', code, status }]));
    const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
    res.status.mockReturnValue(res); res.json.mockReturnValue(res);
    await handler({ method: 'GET', query: { symbol: 'AAPL', period: '5y' } } as unknown as VercelRequest, res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(status);
    const payload = res.json.mock.calls[0][0]; expect(payload.code).toBe(code);
    expect(payload.bars).toBeUndefined();
    const symbol = `RETRY${status}`;
    const fetch = vi.fn().mockResolvedValueOnce(response(status, payload)).mockResolvedValue(response(200, { symbol, period: '5y', bars }));
    vi.stubGlobal('fetch', fetch);
    await expect(loadHistory(symbol)).rejects.toThrow(`HTTP ${status}`);
    await expect(loadHistory(symbol)).resolves.toHaveLength(bars.length);
    await loadHistory(symbol, '5y', true);
    expect(fetch.mock.calls[2][0]).toContain('refresh=1');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('normalizes valid dates, last duplicate wins, rejects future and nonpositive/nonfinite values', () => {
    const result = normalizePriceHistory([{ date: '2025-01-03', close: 10 }, { date: '2025-01-02', close: 11 }, { date: '2025-01-03', close: 12 }, ...[NaN, Infinity, 0, -1].map(close => ({ date: '2025-01-04', close })), { date: '2025-02-30', close: 10 }, { date: '2099-01-01', close: 10 }], '2026-09-16');
    expect(result).toEqual([{ date: '2025-01-02', close: 11 }, { date: '2025-01-03', close: 12 }]);
  });
});

describe('calendar and disconnected risk streams', () => {
  const histories = new Map(['AAPL', 'AMD', 'PLTR'].map((s, j) => [s, bars.map((b, i) => ({ ...b, close: b.close * (1 + j * Math.sin(i) * .001) }))]));
  it('aligns three US equity calendars, with hundreds of common intervals', () => {
    const matrix = correlationMatrix(['AAPL', 'AMD', 'PLTR'], histories)!;
    expect(matrix.observations).toBe(bars.length - 1);
    expect(matrix.observations).toBeGreaterThan(1000);
    const rc = riskContributions(matrix.symbols, [.4, .3, .3], matrix.covariance)!;
    expect(rc.contributions.reduce((s, c) => s + c.absolute, 0)).toBeCloseTo(rc.variance, 12);
    expect(rc.contributions.reduce((s, c) => s + c.fraction, 0)).toBeCloseTo(1, 12);
  });
  it('missing session excludes both affected daily intervals, never inserts zero or bridges', () => {
    const partial = new Map(histories); partial.set('AMD', histories.get('AMD')!.filter((_, i) => i !== 100));
    const matrix = correlationMatrix(['AAPL', 'AMD', 'PLTR'], partial)!;
    expect(matrix.observations).toBe(bars.length - 3);
    const history = reconstructPortfolioHistory(['AAPL', 'AMD', 'PLTR'].map(s => tx(s)), partial, '2026-09-16');
    expect(history.missingDates).toEqual([bars[100].date]);
    const performance = performanceMetrics(history.points);
    expect(performance.riskReturns).toHaveLength(bars.length - 3);
    expect(performance.riskReturns.some(r => r.startDate === bars[99].date && r.date === bars[101].date)).toBe(false);
    expect(performance.totalReturn).toBeNull();
    const proxy = buildCurrentHoldingsRiskProxy(['AAPL', 'AMD', 'PLTR'].map(symbol => ({ symbol, quantity: 1 }) as Position), partial);
    expect(proxy.intervals).toHaveLength(bars.length - 3);
  });
  it('weekends never become missing observations', () => {
    const h = reconstructPortfolioHistory([tx('AAPL')], histories, '2026-09-16');
    expect(h.missingDates).toEqual([]);
    expect(performanceMetrics(h.points).riskReturns.length).toBe(bars.length - 1);
    expect(h.points.some((p, i) => i > 0 && Date.parse(p.date) - Date.parse(h.points[i - 1].date) === 3 * 86400000 && p.dailyReturn !== null)).toBe(true);
  });
  it('one BUY leaves 248 clean returns from 250 closes and cannot create TWR/CAGR/drawdown compounding', () => {
    const oneYear = bars.slice(-250);
    const h = reconstructPortfolioHistory([tx('AAPL', oneYear[0].date), tx('AAPL', oneYear[100].date, 'second')], new Map([['AAPL', oneYear]]), '2026-09-16');
    const p = performanceMetrics(h.points);
    expect(p.riskReturns).toHaveLength(248);
    expect(p.returns).toEqual([]); expect(p.twr).toBeNull(); expect(p.cagr).toBeNull();
    expect(volatility(p.riskReturns.map(r => r.value))).not.toBeNull();
    expect(sharpeRatio(p.riskReturns.map(r => r.value), .04)).not.toBeNull();
    const bm = benchmarkMetrics(p.riskReturns, datedReturns(oneYear), .04);
    expect(bm.beta).toBeCloseTo(1); expect(bm.alpha).toBeCloseTo(0); expect(bm.trackingError).toBeCloseTo(0);
    expect(bm.portfolioReturn).toBeNull(); expect(bm.comparison).toEqual([]);
    const rolling = rollingMetric(p.riskReturns, 20, 'volatility');
    expect(rolling.find(r => r.date === oneYear[101].date)?.value).toBeNull();
    expect(rolling.at(-1)?.value).not.toBeNull();
  });
  it('uses effective annual RF and never formats unavailable as zero/nonfinite', () => {
    const rs = datedReturns(bars).map(r => r.value);
    expect((1 + annualToDaily(.05)!) ** 252 - 1).toBeCloseTo(.05, 12);
    expect(sharpeRatio(rs, .05)).toBeCloseTo((mean(rs)! - annualToDaily(.05)!) * 252 / volatility(rs)!);
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) { expect(pct(v)).toBe('—'); expect(numeric(v)).toBe('—'); }
  });
});
