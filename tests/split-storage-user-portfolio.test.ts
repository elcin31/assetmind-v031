import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split cloud ownership scope', () => {
  it('carries authenticated user and canonical portfolio ids', () => {
    const tx: SplitTransaction = { id: 's', portfolio_id: 'local', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' };
    expect(splitToCloudTransaction(tx, 'user', 'cloud')).toMatchObject({ user_id: 'user', portfolio_id: 'cloud' });
  });
});
