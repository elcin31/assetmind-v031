import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { Transaction } from '../src/types';

describe('split as-of semantics', () => {
  it('does not contaminate an earlier cash snapshot with a future malformed split', () => {
    const futureSplit: Transaction = {
      id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 1, split_denominator: 1,
      currency: 'USD', timestamp: '2026-02-01T00:00:00Z', created_at: '2026-02-01T00:00:00Z',
    };
    const result = buildCashLedger([futureSplit], [], '2026-01-01T00:00:00Z', 'USD');
    expect(result.complete).toBe(true);
    expect(result.balance).toBe(0);
  });
});
