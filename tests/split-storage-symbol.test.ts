import { describe, expect, it } from 'vitest';
import { splitFromCloudTransaction } from '../src/storage/splitTransaction';

describe('split cloud symbol normalization', () => {
  it('normalizes a persisted symbol on read', () => {
    const tx = splitFromCloudTransaction({
      transaction_id: 's', portfolio_id: 'p', type: 'SPLIT', symbol: ' aapl ', currency: 'USD',
      split_numerator: 4, split_denominator: 1, executed_at: '2026-01-01T00:00:00Z',
      recorded_at: null, created_at: '2026-01-01T00:00:01Z', client_request_id: null,
    });
    expect(tx.symbol).toBe('AAPL');
  });
});
