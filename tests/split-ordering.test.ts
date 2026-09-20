import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('split ordering', () => {
  it('uses created_at to order same-timestamp BUY then SPLIT then SELL', () => {
    const transactions: Transaction[] = [
      { id: 'c', portfolio_id: 'p', symbol: 'AAPL', type: 'SELL', quantity: 15, price: 60, currency: 'USD', timestamp: '2026-01-01T10:00:00Z', created_at: '2026-01-01T10:00:03Z' },
      { id: 'a', portfolio_id: 'p', symbol: 'AAPL', type: 'BUY', quantity: 10, price: 100, currency: 'USD', timestamp: '2026-01-01T10:00:00Z', created_at: '2026-01-01T10:00:01Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'AAPL', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-01T10:00:00Z', created_at: '2026-01-01T10:00:02Z' },
    ];
    const result = calculatePositions(transactions);
    expect(result.hadInvalidSell).toBe(false);
    expect(result.positions[0].quantity).toBe(5);
    expect(result.positions[0].averageCost).toBe(50);
    expect(result.positions[0].realizedPnL).toBe(150);
  });
});
