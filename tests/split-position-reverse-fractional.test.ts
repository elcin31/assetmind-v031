import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('fractional reverse split inventory', () => {
  it('keeps fractional shares instead of inventing cash-in-lieu', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 7, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 1, split_denominator: 2, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    expect(calculatePositions(rows).positions[0]).toMatchObject({ quantity: 3.5, averageCost: 20, costBasis: 70 });
  });
});
