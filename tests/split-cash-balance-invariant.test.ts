import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { CashEvent, Transaction } from '../src/types';

describe('split cash balance invariant', () => {
  it('leaves funded idle cash unchanged', () => {
    const events: CashEvent[] = [{ id: 'd', portfolio_id: 'p', kind: 'DEPOSIT', amount: 500, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }];
    const rows: Transaction[] = [{ id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' }];
    const result = buildCashLedger(rows, events, '2026-01-03T00:00:00Z', 'USD');
    expect(result.balance).toBe(500);
    expect(result.entries).toHaveLength(1);
  });
});
