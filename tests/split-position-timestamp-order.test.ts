import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('split effective timestamp priority', () => {
  it('orders by execution timestamp before created_at', () => {
    const rows: Transaction[] = [
      { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 2, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
    ];
    expect(calculatePositions(rows).positions[0].quantity).toBe(4);
  });
});
