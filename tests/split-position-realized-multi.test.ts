import { describe, expect, it } from 'vitest';
import { calculatePositionsWithTotals } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('multi-symbol realized pnl with split', () => {
  it('sums closed and open-symbol realized pnl correctly', () => {
    const rows: Transaction[] = [
      { id: 'a1', portfolio_id: 'p', symbol: 'A', type: 'BUY', quantity: 2, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'a2', portfolio_id: 'p', symbol: 'A', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
      { id: 'a3', portfolio_id: 'p', symbol: 'A', type: 'SELL', quantity: 1, price: 8, currency: 'USD', timestamp: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
      { id: 'b1', portfolio_id: 'p', symbol: 'B', type: 'BUY', quantity: 1, price: 20, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b2', portfolio_id: 'p', symbol: 'B', type: 'SELL', quantity: 1, price: 25, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    expect(calculatePositionsWithTotals(rows).totalRealizedPnL).toBe(8);
  });
});
