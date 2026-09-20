import { describe, expect, it } from 'vitest';
import { splitFromCloudTransaction, splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split execution timestamp round trip', () => {
  it('preserves timestamp through executed_at', () => {
    const tx: SplitTransaction = { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-01T12:34:56Z', created_at: '2026-01-01T12:35:00Z' };
    const row = splitToCloudTransaction(tx, 'u', 'p');
    const restored = splitFromCloudTransaction({ transaction_id: row.transaction_id, portfolio_id: row.portfolio_id, type: 'SPLIT', symbol: row.symbol, currency: row.currency, split_numerator: row.split_numerator, split_denominator: row.split_denominator, executed_at: row.executed_at, recorded_at: row.recorded_at, created_at: null, client_request_id: row.client_request_id });
    expect(restored.timestamp).toBe(tx.timestamp);
  });
});
