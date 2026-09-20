import { describe, expect, it } from 'vitest';
import { calculatePositionsWithTotals } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('realized P&L carry across split', () => {
  it('retains realized P&L from a pre-split partial sale', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 10, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SELL', quantity: 2, price: 15, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
    ];
    const result = calculatePositionsWithTotals(rows);
    expect(result.totalRealizedPnL).toBe(10);
    expect(result.positions[0].realizedPnL).toBe(10);
  });
});
