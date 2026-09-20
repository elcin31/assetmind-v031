import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { CashEvent, Transaction } from '../src/types';

describe('split withdrawal summary neutrality', () => {
  it('leaves withdrawal total unchanged', () => {
    const events: CashEvent[] = [
      { id: 'd', portfolio_id: 'p', kind: 'DEPOSIT', amount: 100, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'w', portfolio_id: 'p', kind: 'WITHDRAWAL', amount: 25, currency: 'USD', timestamp: '2026-01-01T01:00:00Z', created_at: '2026-01-01T01:00:00Z' },
    ];
    const split: Transaction = { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' };
    expect(buildCashLedger([split], events, '2026-01-03T00:00:00Z', 'USD').withdrawals).toBe(25);
  });
});
