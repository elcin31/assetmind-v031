import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split canonical portfolio binding', () => {
  it('uses the canonical portfolio id supplied by storage', () => {
    const tx: SplitTransaction = {
      id: 's', portfolio_id: 'local-p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1,
      currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    };
    expect(splitToCloudTransaction(tx, 'u', 'cloud-p').portfolio_id).toBe('cloud-p');
  });
});
