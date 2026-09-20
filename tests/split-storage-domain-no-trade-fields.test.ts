import { describe, expect, it } from 'vitest';
import { splitFromCloudTransaction } from '../src/storage/splitTransaction';

describe('split domain notional shape', () => {
  it('does not synthesize quantity or price', () => {
    const tx = splitFromCloudTransaction({ transaction_id: 's', portfolio_id: 'p', type: 'SPLIT', symbol: 'XYZ', currency: 'USD', split_numerator: 2, split_denominator: 1, executed_at: '2026-01-01T00:00:00Z', recorded_at: null, created_at: null, client_request_id: null });
    expect('quantity' in tx).toBe(false);
    expect('price' in tx).toBe(false);
  });
});
