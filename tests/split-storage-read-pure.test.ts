import { describe, expect, it } from 'vitest';
import { splitFromCloudTransaction, type CloudSplitTransactionRow } from '../src/storage/splitTransaction';

describe('split cloud read codec purity', () => {
  it('does not mutate the cloud row', () => {
    const row: CloudSplitTransactionRow = { transaction_id: 's', portfolio_id: 'p', type: 'SPLIT', symbol: ' xyz ', currency: 'USD', split_numerator: 2, split_denominator: 1, executed_at: '2026-01-01T00:00:00Z', recorded_at: null, created_at: null, client_request_id: null };
    const before = structuredClone(row);
    splitFromCloudTransaction(row);
    expect(row).toEqual(before);
  });
});
