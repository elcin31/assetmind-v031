import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { Transaction } from '../src/types';

describe('split-only currency validation', () => {
  it('rejects a valid split in the wrong base currency', () => {
    const split: Transaction = { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'EUR', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' };
    expect(buildCashLedger([split], [], '2026-01-02T00:00:00Z', 'USD').complete).toBe(false);
  });
});
