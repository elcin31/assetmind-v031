import { describe, expect, it } from 'vitest';
import { calculatePositionsWithTotals } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('multi-asset realized P&L with split', () => {
  it('aggregates realized P&L independently of split event', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'A', type: 'BUY', quantity: 10, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'A', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'B', type: 'BUY', quantity: 5, price: 20, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'd', portfolio_id: 'p', symbol: 'B', type: 'SELL', quantity: 5, price: 25, currency: 'USD', timestamp: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
    ];
    expect(calculatePositionsWithTotals(rows).totalRealizedPnL).toBe(25);
  });
});
