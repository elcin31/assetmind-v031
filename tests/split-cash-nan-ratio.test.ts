import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { Transaction } from '../src/types';

describe('NaN split ratio', () => {
  it('marks the ledger unavailable', () => {
    const split: Transaction = { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: Number.NaN, split_denominator: 2, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' };
    expect(buildCashLedger([split], [], '2026-01-02T00:00:00Z', 'USD').complete).toBe(false);
  });
});
