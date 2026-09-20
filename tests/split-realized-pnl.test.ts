import { describe, expect, it } from 'vitest';
import { calculatePositionsWithTotals } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('realized P&L after split', () => {
  it('uses split-adjusted average cost', () => {
    const transactions: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'AAPL', type: 'BUY', quantity: 10, price: 100, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'AAPL', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'AAPL', type: 'SELL', quantity: 5, price: 70, currency: 'USD', timestamp: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
    ];
    const result = calculatePositionsWithTotals(transactions);
    expect(result.totalRealizedPnL).toBe(100);
    expect(result.positions[0].quantity).toBe(15);
    expect(result.positions[0].costBasis).toBe(750);
  });
});
