import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split database date', () => {
  it('uses the ISO calendar date encoded in timestamp', () => {
    const tx: SplitTransaction = { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-12-31T23:59:59Z', created_at: '2027-01-01T00:00:01Z' };
    expect(splitToCloudTransaction(tx, 'u', 'p').date).toBe('2026-12-31');
  });
});
