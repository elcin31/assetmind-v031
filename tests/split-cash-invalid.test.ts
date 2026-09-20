import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { Transaction } from '../src/types';

describe('malformed split in cash ledger', () => {
  it('marks ledger unavailable rather than silently accepting the event', () => {
    const split: Transaction = {
      id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 1, split_denominator: 1,
      currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    };
    const result = buildCashLedger([split], [], '2026-01-02T00:00:00Z', 'USD');
    expect(result.complete).toBe(false);
    expect(result.entries).toEqual([]);
  });
});
