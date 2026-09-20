import { describe, expect, it } from 'vitest';
import { canSell } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('fractional split sell capacity', () => {
  it('supports fractional post-split inventory', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 1, price: 90, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 3, split_denominator: 2, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    expect(canSell(rows, 'XYZ', 1.5)).toBe(true);
    expect(canSell(rows, 'XYZ', 1.5001)).toBe(false);
  });
});
