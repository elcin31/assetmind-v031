import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { CashEvent, Transaction } from '../src/types';

describe('cash ledger corporate actions', () => {
  it('ignores a reverse split as a cash flow', () => {
    const events: CashEvent[] = [{
      id: 'd', portfolio_id: 'p', kind: 'DEPOSIT', amount: 1000, currency: 'USD',
      timestamp: '2026-01-01T09:00:00Z', created_at: '2026-01-01T09:00:00Z',
    }];
    const transactions: Transaction[] = [
      {
        id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 100, price: 10, currency: 'USD',
        timestamp: '2026-01-01T10:00:00Z', created_at: '2026-01-01T10:00:00Z',
      },
      {
        id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 1, split_denominator: 10, currency: 'USD',
        timestamp: '2026-01-02T10:00:00Z', created_at: '2026-01-02T10:00:00Z',
      },
    ];
    const result = buildCashLedger(transactions, events, '2026-01-03T00:00:00Z', 'USD');
    expect(result.complete).toBe(true);
    expect(result.balance).toBe(0);
    expect(result.entries).toHaveLength(2);
  });
});
