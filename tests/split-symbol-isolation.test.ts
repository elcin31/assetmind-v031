import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('split symbol isolation', () => {
  it('changes only the affected security', () => {
    const transactions: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'AAPL', type: 'BUY', quantity: 10, price: 100, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'MSFT', type: 'BUY', quantity: 10, price: 200, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'AAPL', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    const positions = calculatePositions(transactions).positions;
    expect(positions.find((p) => p.symbol === 'AAPL')?.quantity).toBe(20);
    expect(positions.find((p) => p.symbol === 'MSFT')?.quantity).toBe(10);
  });
});
