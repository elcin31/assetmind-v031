import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('multi-asset split basis isolation', () => {
  it('preserves each asset basis independently', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'A', type: 'BUY', quantity: 2, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'B', type: 'BUY', quantity: 3, price: 20, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'A', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    const positions = calculatePositions(rows).positions;
    expect(positions.find((p) => p.symbol === 'A')?.costBasis).toBe(20);
    expect(positions.find((p) => p.symbol === 'B')?.costBasis).toBe(60);
  });
});
