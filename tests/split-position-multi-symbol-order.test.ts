import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('multi-symbol split ordering', () => {
  it('sorts and applies each symbol history independently', () => {
    const rows: Transaction[] = [
      { id: 'd', portfolio_id: 'p', symbol: 'B', type: 'SPLIT', split_numerator: 3, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
      { id: 'a', portfolio_id: 'p', symbol: 'A', type: 'BUY', quantity: 2, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'B', type: 'BUY', quantity: 2, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'A', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    const positions = calculatePositions(rows).positions;
    expect(positions.find((p) => p.symbol === 'A')?.quantity).toBe(4);
    expect(positions.find((p) => p.symbol === 'B')?.quantity).toBe(6);
  });
});
