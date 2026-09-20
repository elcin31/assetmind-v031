import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split symbol write', () => {
  it('writes the canonical symbol supplied by validated storage', () => {
    const tx: SplitTransaction = {
      id: 's', portfolio_id: 'p', symbol: 'AAPL', type: 'SPLIT', split_numerator: 4, split_denominator: 1,
      currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    };
    expect(splitToCloudTransaction(tx, 'u', 'p').symbol).toBe('AAPL');
  });
});
