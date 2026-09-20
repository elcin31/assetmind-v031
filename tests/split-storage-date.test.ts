import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split persistence date', () => {
  it('derives the database date from executed_at', () => {
    const tx: SplitTransaction = {
      id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1,
      currency: 'USD', timestamp: '2026-03-04T15:30:00Z', created_at: '2026-03-04T15:31:00Z',
    };
    expect(splitToCloudTransaction(tx, 'u', 'p').date).toBe('2026-03-04');
  });
});
