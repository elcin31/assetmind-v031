import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split storage codec purity', () => {
  it('does not mutate the domain transaction', () => {
    const tx: SplitTransaction = { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' };
    const before = structuredClone(tx);
    splitToCloudTransaction(tx, 'u', 'p');
    expect(tx).toEqual(before);
  });
});
