import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('split position engine purity', () => {
  it('does not mutate input ledger rows', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'xyz', type: 'BUY', quantity: 2, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    const before = structuredClone(rows);
    calculatePositions(rows);
    expect(rows).toEqual(before);
  });
});
