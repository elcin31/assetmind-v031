import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('invalid split ratio', () => {
  it('leaves inventory unchanged when a malformed local split reaches pure math', () => {
    const transactions: Transaction[] = [
      { id: 'b', portfolio_id: 'p', symbol: 'AAPL', type: 'BUY', quantity: 10, price: 100, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 's', portfolio_id: 'p', symbol: 'AAPL', type: 'SPLIT', split_numerator: 0, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    const position = calculatePositions(transactions).positions[0];
    expect(position.quantity).toBe(10);
    expect(position.averageCost).toBe(100);
    expect(position.costBasis).toBe(1000);
  });
});
