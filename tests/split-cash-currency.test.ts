import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { Transaction } from '../src/types';

describe('split currency integrity', () => {
  it('does not let a split row bypass base-currency validation', () => {
    const split: Transaction = {
      id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1,
      currency: 'EUR', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    };
    const result = buildCashLedger([split], [], '2026-01-02T00:00:00Z', 'USD');
    expect(result.complete).toBe(false);
    expect(result.reason).toContain('USD');
  });
});
