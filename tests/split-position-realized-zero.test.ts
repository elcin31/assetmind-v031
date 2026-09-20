import { describe, expect, it } from 'vitest';
import { calculatePositionsWithTotals } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('split realized P&L neutrality', () => {
  it('keeps realized P&L at zero for buy then split', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 10, price: 100, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    const result = calculatePositionsWithTotals(rows);
    expect(result.totalRealizedPnL).toBe(0);
    expect(result.positions[0].realizedPnL).toBe(0);
  });
});
