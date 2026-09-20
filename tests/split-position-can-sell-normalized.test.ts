import { describe, expect, it } from 'vitest';
import { canSell } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('canSell split symbol normalization', () => {
  it('matches normalized query symbol to split-adjusted position', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'xyz', type: 'BUY', quantity: 5, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    expect(canSell(rows, ' xyz ', 10)).toBe(true);
  });
});
