import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('explicit split persistence', () => {
  it('serializes an explicit ledger event with its own transaction id', () => {
    const tx: SplitTransaction = { id: 'explicit-split', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' };
    expect(splitToCloudTransaction(tx, 'u', 'p').transaction_id).toBe('explicit-split');
  });
});
