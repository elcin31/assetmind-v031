import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split persistence notional', () => {
  it('writes no quantity, price, or amount', () => {
    const tx: SplitTransaction = {
      id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 5, split_denominator: 4,
      currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    };
    const row = splitToCloudTransaction(tx, 'u', 'p');
    expect([row.quantity, row.price, row.amount]).toEqual([null, null, null]);
  });
});
