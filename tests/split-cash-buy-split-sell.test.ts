import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { CashEvent, Transaction } from '../src/types';

describe('BUY SPLIT SELL cash notional', () => {
  it('uses only actual BUY and SELL notionals', () => {
    const events: CashEvent[] = [{ id: 'd', portfolio_id: 'p', kind: 'DEPOSIT', amount: 1000, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }];
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 10, price: 50, currency: 'USD', timestamp: '2026-01-01T01:00:00Z', created_at: '2026-01-01T01:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
      { id: 'c', portfolio_id: 'p', symbol: 'XYZ', type: 'SELL', quantity: 10, price: 30, currency: 'USD', timestamp: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
    ];
    expect(buildCashLedger(rows, events, '2026-01-04T00:00:00Z', 'USD').balance).toBe(800);
  });
});
