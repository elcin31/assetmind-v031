import { describe, expect, it } from 'vitest';
import { calculatePositionsWithTotals } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('zero inventory split basis', () => {
  it('keeps no open position and no realized pnl', () => {
    const split: Transaction = { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' };
    expect(calculatePositionsWithTotals([split])).toEqual({ positions: [], totalRealizedPnL: 0, hadInvalidSell: false });
  });
});
