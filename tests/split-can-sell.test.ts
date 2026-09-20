import { describe, expect, it } from 'vitest';
import { canSell } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('canSell after reverse split', () => {
  it('uses reduced post-split quantity', () => {
    const transactions: Transaction[] = [
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 100, price: 2, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 1, split_denominator: 10, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    expect(canSell(transactions, 'XYZ', 10)).toBe(true);
    expect(canSell(transactions, 'XYZ', 10.0001)).toBe(false);
  });
});
