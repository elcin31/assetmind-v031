import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { CashEvent, Transaction } from '../src/types';

describe('cash ordering around split', () => {
  it('keeps remaining cash operations chronological', () => {
    const events: CashEvent[] = [{ id: 'd', portfolio_id: 'p', kind: 'DEPOSIT', amount: 100, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }];
    const rows: Transaction[] = [
      { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-01T01:00:00Z', created_at: '2026-01-01T01:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 1, price: 10, currency: 'USD', timestamp: '2026-01-01T02:00:00Z', created_at: '2026-01-01T02:00:00Z' },
    ];
    expect(buildCashLedger(rows, events, '2026-01-02T00:00:00Z', 'USD').entries.map((entry) => entry.id)).toEqual(['d', 'b']);
  });
});
