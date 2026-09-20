import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { CashEvent, Transaction } from '../src/types';

describe('split fee summary neutrality', () => {
  it('leaves fee total unchanged', () => {
    const events: CashEvent[] = [
      { id: 'd', portfolio_id: 'p', kind: 'DEPOSIT', amount: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'f', portfolio_id: 'p', kind: 'FEE', amount: 2, currency: 'USD', timestamp: '2026-01-01T01:00:00Z', created_at: '2026-01-01T01:00:00Z' },
    ];
    const split: Transaction = { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' };
    expect(buildCashLedger([split], events, '2026-01-03T00:00:00Z', 'USD').fees).toBe(2);
  });
});
