import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { Transaction } from '../src/types';

describe('split-only cash ledger', () => {
  it('remains complete at zero cash for a valid split-only history', () => {
    const split: Transaction = {
      id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 3, split_denominator: 2,
      currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    };
    const result = buildCashLedger([split], [], '2026-01-02T00:00:00Z', 'USD');
    expect(result.complete).toBe(true);
    expect(result.balance).toBe(0);
    expect(result.entries).toEqual([]);
  });
});
