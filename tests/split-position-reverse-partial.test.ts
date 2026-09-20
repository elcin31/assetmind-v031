import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('reverse split after partial close', () => {
  it('preserves remaining cost basis', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 10, price: 20, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SELL', quantity: 4, price: 25, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 1, split_denominator: 2, currency: 'USD', timestamp: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
    ];
    expect(calculatePositions(rows).positions[0]).toMatchObject({ quantity: 3, averageCost: 40, costBasis: 120, realizedPnL: 20 });
  });
});
