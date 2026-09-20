import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('reverse split persistence', () => {
  it('does not collapse numerator/denominator into a floating ratio', () => {
    const tx: SplitTransaction = {
      id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 1, split_denominator: 10,
      currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    };
    const row = splitToCloudTransaction(tx, 'u', 'p');
    expect(row.split_numerator).toBe(1);
    expect(row.split_denominator).toBe(10);
  });
});
