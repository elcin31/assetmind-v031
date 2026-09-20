import { describe, expect, it } from 'vitest';
import { calculatePositionsWithTotals } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('reverse split then sale', () => {
  it('uses raised WAC for realized P&L and remaining basis', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 100, price: 2, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 1, split_denominator: 10, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'XYZ', type: 'SELL', quantity: 4, price: 25, currency: 'USD', timestamp: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
    ];
    const result = calculatePositionsWithTotals(rows);
    expect(result.totalRealizedPnL).toBe(20);
    expect(result.positions[0]).toMatchObject({ quantity: 6, averageCost: 20, costBasis: 120 });
  });
});
