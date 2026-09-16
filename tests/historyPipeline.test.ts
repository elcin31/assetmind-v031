import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HistoryBar, Position, Transaction } from '../src/types';
import { normalizePriceHistory } from '../src/utils/priceHistory';
import { datedReturns, performanceMetrics } from '../src/math/performance';
import { volatility } from '../src/math/statistics';
import { sharpeRatio } from '../src/math/ratios';
import { correlationMatrix } from '../src/math/correlation';
import { reconstructPortfolioHistory } from '../src/math/portfolioHistory';
import { buildCurrentHoldingsRiskProxy } from '../src/math/returns';
import { riskContributions } from '../src/math/riskContribution';
import { portfolioVariance } from '../src/math/covariance';
import { alignReturns, benchmarkMetrics } from '../src/math/benchmark';
import {
  MarketDataProviderError,
  marketData,
} from '../server/marketData';
import {
  clearHistoryCache,
  HistoryRequestError,
  loadHistory,
} from '../src/analytics/historyCache';

function weekdayBars(
  start: string,
  observations: number,
  phase = 0,
): HistoryBar[] {
  const bars: HistoryBar[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  let close = 100 + phase * 7;
  let i = 0;
  while (bars.length < observations) {
    const weekday = d.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      close *= 1 + Math.sin((i + phase) * 0.37) * 0.012 + 0.00035;
      bars.push({ date: d.toISOString().slice(0, 10), close });
      i++;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return bars;
}

function transaction(
  id: string,
  date: string,
  quantity = 1,
  type: 'BUY' | 'SELL' = 'BUY',
  symbol = 'AAPL',
): Transaction {
  return {
    id,
    portfolio_id: 'p',
    symbol,
    type,
    quantity,
    price: 100,
    currency: 'USD',
    timestamp: `${date}T12:00:00Z`,
    created_at: `${date}T12:01:00Z`,
  };
}

function position(symbol: string, quantity = 1): Position {
  return {
    symbol,
    quantity,
    averageCost: 100,
    costBasis: 100 * quantity,
    realizedPnL: 0,
    marketPrice: 150,
    marketValue: 150 * quantity,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearHistoryCache();
});

describe('historical data normalization and provider failures', () => {
  it('normalizes unsorted duplicates deterministically and rejects invalid/future closes', () => {
    const normalized = normalizePriceHistory(
      [
        { date: '2026-01-03', close: 103 },
        { date: '2026-01-02', close: 101 },
        { date: '2026-01-02', close: 102 },
        { date: '2026-01-04', close: 0 },
        { date: '2026-01-05', close: -1 },
        { date: '2026-01-06', close: Number.NaN },
        { date: '2026-01-07', close: Number.POSITIVE_INFINITY },
        { date: '01/08/2026', close: 108 },
        { date: '2027-01-01', close: 109 },
      ],
      '2026-12-31',
    );
    expect(normalized).toEqual([
      { date: '2026-01-02', close: 102 },
      { date: '2026-01-03', close: 103 },
    ]);
  });

  it('surfaces provider 401 instead of successful empty history', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })));
    await expect(marketData.history('AUTH401', '5y')).rejects.toMatchObject({
      name: 'MarketDataProviderError',
      code: 'PROVIDER_AUTHENTICATION',
      upstreamStatus: 401,
      retryable: false,
    } satisfies Partial<MarketDataProviderError>);
  });

  it('surfaces provider 429 and does not cache the failure', async () => {
    const fetchMock = vi.fn(async () => new Response('rate limited', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(marketData.history('RATE429', '5y')).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMIT',
      upstreamStatus: 429,
      retryable: true,
    });
    await expect(marketData.history('RATE429', '5y')).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMIT',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never treats an empty 5Y provider payload as successful history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          chart: {
            error: null,
            result: [
              {
                timestamp: [],
                indicators: { adjclose: [{ adjclose: [] }] },
              },
            ],
          },
        }),
      ),
    );
    await expect(marketData.history('EMPTY5Y', '5y')).rejects.toMatchObject({
      code: 'PROVIDER_EMPTY_HISTORY',
    });
  });

  it('maps a structured provider 401 to a distinguishable frontend error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            error: 'provider auth failed',
            code: 'PROVIDER_AUTHENTICATION',
            provider: 'yahoo',
            upstreamStatus: 401,
            retryable: false,
            bars: [],
          },
          { status: 502 },
        ),
      ),
    );
    const error = await loadHistory('CLIENT401').catch((value) => value);
    expect(error).toBeInstanceOf(HistoryRequestError);
    expect((error as HistoryRequestError).issue).toMatchObject({
      code: 'PROVIDER_AUTHENTICATION',
      provider: 'yahoo',
      upstreamStatus: 401,
      retryable: false,
    });
  });

  it('retry after frontend 429 performs a real second request', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          error: 'rate limit',
          code: 'PROVIDER_RATE_LIMIT',
          provider: 'yahoo',
          upstreamStatus: 429,
          retryable: true,
          bars: [],
        },
        { status: 429 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadHistory('CLIENT429')).rejects.toMatchObject({
      issue: { code: 'PROVIDER_RATE_LIMIT', retryable: true },
    });
    await expect(loadHistory('CLIENT429')).rejects.toMatchObject({
      issue: { code: 'PROVIDER_RATE_LIMIT' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('trading calendars and clean risk returns', () => {
  it('5 years of AAPL-like daily history gives >1000 bars and available volatility/Sharpe', () => {
    const bars = weekdayBars('2021-09-16', 1260);
    const returns = datedReturns(bars).map((r) => r.value);
    expect(bars.length).toBeGreaterThan(1000);
    expect(returns.length).toBeGreaterThan(1000);
    expect(volatility(returns)).not.toBeNull();
    expect(sharpeRatio(returns, 0.03)).not.toBeNull();
  });

  it('three assets on the same US trading calendar have hundreds of common intervals', () => {
    const histories = new Map<string, HistoryBar[]>([
      ['AAPL', weekdayBars('2025-01-02', 252, 0)],
      ['AMD', weekdayBars('2025-01-02', 252, 3)],
      ['PLTR', weekdayBars('2025-01-02', 252, 7)],
    ]);
    const matrix = correlationMatrix(['AAPL', 'AMD', 'PLTR'], histories);
    expect(matrix).not.toBeNull();
    expect(matrix!.observations).toBe(251);
    expect(matrix!.observations).toBeGreaterThan(20);
  });

  it('one missing trading date removes only affected exact intervals and fabricates no zero return', () => {
    const a = weekdayBars('2025-01-02', 260, 0);
    const b = a.filter((_, index) => index !== 100);
    const matrix = correlationMatrix(
      ['AAPL', 'AMD'],
      new Map([
        ['AAPL', a],
        ['AMD', b],
      ]),
    );
    expect(matrix?.observations).toBe(257);
    expect(matrix?.returns[1].some((r) => r.value === 0)).toBe(false);

    const proxy = buildCurrentHoldingsRiskProxy(
      [position('AAPL'), position('AMD')],
      new Map([
        ['AAPL', a],
        ['AMD', b],
      ]),
    );
    const missingDate = a[100].date;
    expect(
      proxy.returns.some(
        (r) => r.startDate === a[99].date && r.date === a[101].date,
      ),
    ).toBe(false);
    expect(proxy.returns.some((r) => r.date === missingDate)).toBe(false);
  });

  it('a weekend is not classified as a missing market observation', () => {
    const friMonTue: HistoryBar[] = [
      { date: '2026-01-02', close: 100 },
      { date: '2026-01-05', close: 102 },
      { date: '2026-01-06', close: 101 },
    ];
    const history = reconstructPortfolioHistory(
      [transaction('buy', '2026-01-01')],
      new Map([['AAPL', friMonTue]]),
      '2026-01-06',
    );
    expect(history.missingDates).toEqual([]);
    expect(history.points.map((p) => p.date)).toEqual([
      '2026-01-02',
      '2026-01-05',
      '2026-01-06',
    ]);
    expect(history.points[1].dailyReturn).toBeCloseTo(0.02);
  });

  it('BUY inside 1Y makes cumulative TWR unavailable but preserves clean risk observations', () => {
    const bars = weekdayBars('2025-09-16', 252, 0);
    const tradeDate = bars[120].date;
    const history = reconstructPortfolioHistory(
      [
        transaction('initial', '2025-09-15', 1),
        transaction('second', tradeDate, 1),
      ],
      new Map([['AAPL', bars]]),
      bars.at(-1)!.date,
    );
    const performance = performanceMetrics(history.points);
    expect(performance.totalReturn).toBeNull();
    expect(performance.twr).toBeNull();
    expect(performance.cagr).toBeNull();
    expect(performance.riskReturns.length).toBeGreaterThanOrEqual(249);
    const values = performance.riskReturns.map((r) => r.value);
    expect(volatility(values)).not.toBeNull();
    expect(sharpeRatio(values)).not.toBeNull();
  });
});

describe('covariance, benchmark, and unavailable identities', () => {
  it('risk contributions sum exactly to portfolio variance and fractions sum to one', () => {
    const covariance = [
      [0.04, 0.006, 0.004],
      [0.006, 0.09, 0.01],
      [0.004, 0.01, 0.0625],
    ];
    const weights = [0.4, 0.35, 0.25];
    const variance = portfolioVariance(weights, covariance)!;
    const result = riskContributions(['AAPL', 'AMD', 'PLTR'], weights, covariance)!;
    expect(result.variance).toBeCloseTo(variance, 12);
    expect(result.contributions.reduce((s, r) => s + r.absolute, 0)).toBeCloseTo(
      variance,
      12,
    );
    expect(result.contributions.reduce((s, r) => s + r.fraction, 0)).toBeCloseTo(
      1,
      12,
    );
  });

  it('benchmark uses strictly aligned start/end intervals and preserves regression identities', () => {
    const market = weekdayBars('2025-01-02', 80, 4);
    const marketReturns = datedReturns(market);
    const portfolioReturns = marketReturns.map((r) => ({ ...r, value: r.value * 1.2 }));
    const withMissing = marketReturns.filter((_, index) => index !== 20);
    const aligned = alignReturns(portfolioReturns, withMissing);
    expect(aligned).toHaveLength(marketReturns.length - 1);
    expect(
      aligned.every(
        (r) =>
          r.startDate < r.date &&
          portfolioReturns.some(
            (p) => p.startDate === r.startDate && p.date === r.date,
          ),
      ),
    ).toBe(true);
    const metrics = benchmarkMetrics(portfolioReturns, withMissing, 0);
    expect(metrics.observations).toBe(aligned.length);
    expect(metrics.beta).toBeCloseTo(1.2, 10);
    expect(metrics.portfolioReturn).toBeNull();
    expect(metrics.benchmarkReturn).toBeNull();
  });

  it('mathematically unavailable metrics stay null, never fabricated zero/Infinity/NaN', () => {
    const flat = Array(30).fill(0);
    expect(volatility(flat)).toBe(0);
    expect(sharpeRatio(flat)).toBeNull();
    expect(correlationMatrix(['A', 'B'], new Map())).toBeNull();
    const undefinedValues = [sharpeRatio(flat), portfolioVariance([], [])];
    expect(undefinedValues.every((value) => value === null)).toBe(true);
    expect(
      undefinedValues.some(
        (value) => typeof value === 'number' && !Number.isFinite(value),
      ),
    ).toBe(false);
  });
});
