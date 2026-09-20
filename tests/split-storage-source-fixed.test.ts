import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split source determinism', () => {
  it('uses the same source for reverse and forward split rows', () => {
    const make = (n: number, d: number): SplitTransaction => ({ id: `${n}-${d}`, portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: n, split_denominator: d, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' });
    expect(splitToCloudTransaction(make(2, 1), 'u', 'p').source).toBe(splitToCloudTransaction(make(1, 2), 'u', 'p').source);
  });
});
