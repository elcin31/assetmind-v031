import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('non-integer split ratio persistence', () => {
  it('stores 3-for-2 as exact integers', () => {
    const tx: SplitTransaction = {
      id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 3, split_denominator: 2,
      currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    };
    const row = splitToCloudTransaction(tx, 'u', 'p');
    expect([row.split_numerator, row.split_denominator]).toEqual([3, 2]);
  });
});
