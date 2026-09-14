import { describe, it, expect } from 'vitest';
import { enrichPositionsWithQuotes } from '../src/math/pnl';
import type { Transaction, Quote } from '../src/types';

function tx(
  symbol: string,
  type: 'BUY' | 'SELL',
  quantity: number,
  price: number
): Transaction {
  return {
    id: '1',
    portfolio_id: 'p',
    symbol,
    type,
    quantity,
    price,
    currency: 'USD',
    timestamp: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('enrichPositionsWithQuotes', () => {
  it('computes unrealized and total P&L', () => {
    const txs = [tx('AAPL', 'BUY', 10, 200)];
    const quotes = new Map<string, Quote>([
      [
        'AAPL',
        {
          symbol: 'AAPL',
          price: 250,
          change: 5,
          changePercent: 2,
          timestamp: Date.now(),
        },
      ],
    ]);
    const result = enrichPositionsWithQuotes(txs, quotes);
    expect(result.positions[0].marketValue).toBe(2500);
    expect(result.positions[0].unrealizedPnL).toBe(500);
    expect(result.portfolioValue).toBe(2500);
    expect(result.unrealizedPnL).toBe(500);
    expect(result.realizedPnL).toBe(0);
    expect(result.totalPnL).toBe(500);
    expect(result.allocation[0].weight).toBeCloseTo(1);
  });

  it('reports incomplete valuation when a live quote is missing', () => {
    const txs = [
      tx('AAPL', 'BUY', 10, 200),
      { ...tx('MSFT', 'BUY', 2, 300), id: '2' },
    ];
    const quotes = new Map<string, Quote>([
      [
        'AAPL',
        {
          symbol: 'AAPL',
          price: 250,
          change: 0,
          changePercent: 0,
          timestamp: Date.now(),
        },
      ],
    ]);

    const result = enrichPositionsWithQuotes(txs, quotes);
    expect(result.valuation.complete).toBe(false);
    expect(result.valuation.unpricedSymbols).toEqual(['MSFT']);
    expect(result.valuation.pricedPositions).toBe(1);
    expect(result.valuation.totalPositions).toBe(2);
    expect(result.portfolioValue).toBe(2500);
  });

});
