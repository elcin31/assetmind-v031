import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('split deterministic tie breaking', () => {
  it('falls back to id when timestamp and created_at are equal', () => {
    const time = '2026-01-01T00:00:00Z';
    const transactions: Transaction[] = [
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: time, created_at: time },
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 10, price: 10, currency: 'USD', timestamp: time, created_at: time },
    ];
    const position = calculatePositions(transactions).positions[0];
    expect(position.quantity).toBe(20);
    expect(position.costBasis).toBe(100);
  });
});
