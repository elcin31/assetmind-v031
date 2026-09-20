import { describe, expect, it } from 'vitest';
import { tradeTransactions } from '../src/math/securityLedger';
import type { Transaction } from '../src/types';

describe('trade projection ordering', () => {
  it('removes SPLIT without reordering BUY/SELL', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 10, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'XYZ', type: 'SELL', quantity: 5, price: 7, currency: 'USD', timestamp: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
    ];
    expect(tradeTransactions(rows).map((row) => row.id)).toEqual(['a', 'c']);
  });
});
