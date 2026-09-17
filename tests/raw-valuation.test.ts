import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CashEvent, HistoryBar, PortfolioSnapshot, Quote, Transaction } from '../src/types';
import { marketData } from '../server/marketData';
import {
  clearHistoryCache,
  loadHistoricalMarketData,
  loadHistory,
} from '../src/analytics/historyCache';
import { calculatePortfolioAnalytics } from '../src/math/analytics';
import { enrichPositionsWithQuotes } from '../src/math/pnl';

const epoch = (iso: string) => Date.parse(`${iso}T13:30:00Z`) / 1000;

afterEach(() => {
  vi.unstubAllGlobals();
  clearHistoryCache();
});

describe('raw historical valuation data', () => {
  it('keeps Yahoo adjusted close, raw close and stock splits as separate series', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({
        chart: {
          error: null,
          result: [{
            timestamp: [epoch('2026-09-10'), epoch('2026-09-11')],
            indicators: {
              adjclose: [{ adjclose: [98, 99] }],
              quote: [{ close: [100, 50] }],
            },
            events: {
              splits: {
                split: {
                  date: epoch('2026-09-11'),
                  numerator: 2,
                  denominator: 1,
                  splitRatio: '2:1',
                },
              },
            },
          }],
        },
      })),
    );

    const result = await marketData.history('RAWVAL', '1m');
    expect(result.bars).toEqual([
      { date: '2026-09-10', close: 98 },
      { date: '2026-09-11', close: 99 },
    ]);
    expect(result.valuationBars).toEqual([
      { date: '2026-09-10', close: 100 },
      { date: '2026-09-11', close: 50 },
    ]);
    expect(result.priceType).toBe('adjusted');
    expect(result.valuationPriceType).toBe('close');
    expect(result.splits).toHaveLength(1);
    expect(result.splits[0]).toMatchObject({
      date: '2026-09-11',
      numerator: 2,
      denominator: 1,
      ratio: 2,
    });
  });

  it('deduplicates adjusted and raw consumers onto one frontend request', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      symbol: 'DUAL',
      period: '5y',
      provider: 'yahoo',
      priceType: 'adjusted',
      valuationPriceType: 'close',
      bars: [
        { date: '2026-09-10', close: 98 },
        { date: '2026-09-11', close: 99 },
      ],
      valuationBars: [
        { date: '2026-09-10', close: 100 },
        { date: '2026-09-11', close: 100 },
      ],
      splits: [],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const [bundle, adjusted] = await Promise.all([
      loadHistoricalMarketData('DUAL'),
      loadHistory('DUAL'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(adjusted).toBe(bundle.bars);
    expect(bundle.valuationBars[0].close).toBe(100);
  });
});

function tx(): Transaction {
  return {
    id: 'buy',
    portfolio_id: 'p',
    symbol: 'AAPL',
    type: 'BUY',
    quantity: 1,
    price: 100,
    currency: 'USD',
    timestamp: '2026-09-10T14:00:00Z',
    created_at: '2026-09-10T14:00:01Z',
  };
}

function deposit(kind: 'DEPOSIT' | 'DIVIDEND', amount: number, day: string, id: string): CashEvent {
  return {
    id,
    portfolio_id: 'p',
    kind,
    amount,
    currency: 'USD',
    timestamp: `${day}T12:00:00Z`,
    created_at: `${day}T12:00:01Z`,
  };
}

function snapshot(cashEvents: CashEvent[]): PortfolioSnapshot {
  const transaction = tx();
  const quote: Quote = {
    symbol: 'AAPL',
    price: 100,
    change: 0,
    changePercent: 0,
    timestamp: epoch('2026-09-11'),
  };
  const market = enrichPositionsWithQuotes([transaction], new Map([['AAPL', quote]]));
  return {
    portfolio: {
      id: 'p',
      name: 'Test',
      base_currency: 'USD',
      created_at: '2026-09-10T00:00:00Z',
    },
    transactions: [transaction],
    ...market,
    cashEvents,
  };
}

const adjusted: HistoryBar[] = [
  { date: '2026-09-10', close: 100 },
  { date: '2026-09-11', close: 105 },
];
const raw: HistoryBar[] = [
  { date: '2026-09-10', close: 100 },
  { date: '2026-09-11', close: 100 },
];

it('actual account performance uses raw close while risk/proxy retains adjusted close', () => {
  const funding = deposit('DEPOSIT', 200, '2026-09-10', 'funding');
  const dividend = deposit('DIVIDEND', 5, '2026-09-11', 'dividend');
  const histories = new Map<string, HistoryBar[]>([
    ['AAPL', adjusted],
    ['SPY', adjusted],
  ]);

  const analytics = calculatePortfolioAnalytics(
    snapshot([funding, dividend]),
    histories,
    'SPY',
    'ALL',
    '20D',
    '2026-09-11',
    0,
    0,
    {
      valuationHistories: new Map([['AAPL', raw]]),
      splits: new Map([['AAPL', []]]),
      coverageStarts: new Map([['AAPL', '2026-09-01']]),
    },
  );

  expect(analytics.history.reason).toBeNull();
  expect(analytics.history.points.map((point) => point.value)).toEqual([200, 205]);
  expect(analytics.performance.totalReturn).toBeCloseTo(0.025, 12);
  expect(analytics.proxy.values).toEqual([100, 105]);
});
