import { describe, expect, it } from 'vitest';
import { splitFromCloudTransaction } from '../src/storage/splitTransaction';

describe('split domain ratio', () => {
  it('exposes numerator and denominator separately', () => {
    const tx = splitFromCloudTransaction({ transaction_id: 's', portfolio_id: 'p', type: 'SPLIT', symbol: 'XYZ', currency: 'USD', split_numerator: 5, split_denominator: 4, executed_at: '2026-01-01T00:00:00Z', recorded_at: null, created_at: null, client_request_id: null });
    if (tx.type !== 'SPLIT') throw new Error('Expected split');
    expect([tx.split_numerator, tx.split_denominator]).toEqual([5, 4]);
  });
});
