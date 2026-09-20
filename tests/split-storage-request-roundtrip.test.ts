import { describe, expect, it } from 'vitest';
import { splitFromCloudTransaction, splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split request id round trip', () => {
  it('preserves idempotency key', () => {
    const tx: SplitTransaction = { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', client_request_id: 'req' };
    const row = splitToCloudTransaction(tx, 'u', 'p');
    const restored = splitFromCloudTransaction({ transaction_id: row.transaction_id, portfolio_id: row.portfolio_id, type: 'SPLIT', symbol: row.symbol, currency: row.currency, split_numerator: row.split_numerator, split_denominator: row.split_denominator, executed_at: row.executed_at, recorded_at: row.recorded_at, created_at: null, client_request_id: row.client_request_id });
    expect(restored.client_request_id).toBe('req');
  });
});
