import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('WAC across split sequence', () => {
  it('preserves old basis and blends later buys at post-split price', () => {
    const transactions: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'AAPL', type: 'BUY', quantity: 10, price: 100, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'AAPL', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'AAPL', type: 'BUY', quantity: 10, price: 60, currency: 'USD', timestamp: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
    ];
    const position = calculatePositions(transactions).positions[0];
    expect(position.quantity).toBe(30);
    expect(position.costBasis).toBe(1600);
    expect(position.averageCost).toBeCloseTo(53.333333, 5);
  });
});
