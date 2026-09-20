import { describe, expect, it } from 'vitest';
import { splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

describe('split retry key write', () => {
  it('persists client_request_id for idempotent mutation retries', () => {
    const tx: SplitTransaction = {
      id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1,
      currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', client_request_id: 'req-42',
    };
    expect(splitToCloudTransaction(tx, 'u', 'p').client_request_id).toBe('req-42');
  });
});
