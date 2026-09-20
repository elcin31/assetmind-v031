import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split executed_at', () => {
  it('persists the effective corporate-action timestamp', () => {
    const tx: SplitTransaction = {
      id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1,
      currency: 'USD', timestamp: '2026-01-02T14:30:00Z', created_at: '2026-01-03T00:00:00Z',
    };
    expect(splitToCloudTransaction(tx, 'u', 'p').executed_at).toBe('2026-01-02T14:30:00Z');
  });
});
