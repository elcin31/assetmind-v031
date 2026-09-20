import { describe, expect, it } from 'vitest';
import { splitFromCloudTransaction } from '../src/storage/splitTransaction';

describe('split numeric conversion', () => {
  it('returns finite numeric ratio parts', () => {
    const tx = splitFromCloudTransaction({ transaction_id: 's', portfolio_id: 'p', type: 'SPLIT', symbol: 'XYZ', currency: 'USD', split_numerator: 3, split_denominator: 2, executed_at: '2026-01-01T00:00:00Z', recorded_at: null, created_at: null, client_request_id: null });
    if (tx.type !== 'SPLIT') throw new Error('Expected split');
    expect(Number.isFinite(tx.split_numerator)).toBe(true);
    expect(Number.isFinite(tx.split_denominator)).toBe(true);
  });
});
