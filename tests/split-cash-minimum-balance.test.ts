import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { CashEvent, Transaction } from '../src/types';

describe('split cash minimum balance', () => {
  it('does not change the running minimum', () => {
    const event: CashEvent = { id: 'd', portfolio_id: 'p', kind: 'DEPOSIT', amount: 100, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' };
    const split: Transaction = { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' };
    const result = buildCashLedger([split], [event], '2026-01-03T00:00:00Z', 'USD');
    expect(result.minimumBalance).toBe(0);
  });
});
