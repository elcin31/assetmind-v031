import { describe, expect, it } from 'vitest';
import { splitFromCloudTransaction } from '../src/storage/splitTransaction';

describe('split absent idempotency key', () => {
  it('does not synthesize a request id', () => {
    const tx = splitFromCloudTransaction({
      transaction_id: 's', portfolio_id: 'p', type: 'SPLIT', symbol: 'XYZ', currency: 'USD',
      split_numerator: 2, split_denominator: 1, executed_at: '2026-01-01T00:00:00Z',
      recorded_at: null, created_at: null, client_request_id: null,
    });
    expect(tx.client_request_id).toBeUndefined();
    expect(tx.created_at).toBe('2026-01-01T00:00:00Z');
  });
});
