import { describe, expect, it } from 'vitest';
import { calculatePositionsWithTotals } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('BUY SPLIT SELL position state', () => {
  it('keeps remaining split-adjusted inventory and basis', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 10, price: 50, currency: 'USD', timestamp: '2026-01-01T01:00:00Z', created_at: '2026-01-01T01:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'XYZ', type: 'SELL', quantity: 10, price: 30, currency: 'USD', timestamp: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
    ];
    const result = calculatePositionsWithTotals(rows);
    expect(result.positions[0]).toMatchObject({ quantity: 10, averageCost: 25, costBasis: 250, realizedPnL: 50 });
  });
});
