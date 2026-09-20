import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('reverse split average cost', () => {
  it('multiplies WAC by the inverse ratio', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 9, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 1, split_denominator: 3, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    expect(calculatePositions(rows).positions[0].averageCost).toBe(30);
  });
});
