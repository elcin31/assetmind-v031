import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('no silent split application', () => {
  it('keeps inventory unchanged when no SPLIT row exists', () => {
    const rows: Transaction[] = [{ id: 'a', portfolio_id: 'p', symbol: 'AAPL', type: 'BUY', quantity: 10, price: 100, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }];
    expect(calculatePositions(rows).positions[0]).toMatchObject({ quantity: 10, averageCost: 100, costBasis: 1000 });
  });
});
