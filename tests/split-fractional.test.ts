import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('fractional split ratio', () => {
  it('supports exact numerator/denominator ratios such as 3-for-2', () => {
    const transactions: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 8, price: 30, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 3, split_denominator: 2, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    const position = calculatePositions(transactions).positions[0];
    expect(position.quantity).toBe(12);
    expect(position.averageCost).toBe(20);
    expect(position.costBasis).toBe(240);
  });
});
