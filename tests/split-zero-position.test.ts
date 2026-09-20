import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('split with zero inventory', () => {
  it('does not invent shares when no position exists', () => {
    const split: Transaction = {
      id: 's', portfolio_id: 'p', symbol: 'AAPL', type: 'SPLIT', split_numerator: 4, split_denominator: 1,
      currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    };
    expect(calculatePositions([split]).positions).toEqual([]);
  });
});
