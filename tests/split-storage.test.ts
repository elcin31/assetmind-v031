import { describe, expect, it } from 'vitest';
import { splitFromCloudTransaction, splitToCloudTransaction } from '../src/storage/splitTransaction';
import type { SplitTransaction } from '../src/types';

const split: SplitTransaction = {
  id: 'split-1', portfolio_id: 'p1', symbol: 'NVDA', type: 'SPLIT',
  split_numerator: 10, split_denominator: 1, currency: 'USD',
  timestamp: '2026-01-02T10:00:00Z', created_at: '2026-01-02T10:00:01Z', client_request_id: 'req-1',
};

describe('split storage codec', () => {
  it('writes null trade notional fields and exact ratio fields', () => {
    expect(splitToCloudTransaction(split, 'u1', 'p1')).toMatchObject({
      type: 'SPLIT', quantity: null, price: null, amount: null,
      split_numerator: 10, split_denominator: 1,
    });
  });

  it('round-trips a cloud SPLIT row', () => {
    const row = splitToCloudTransaction(split, 'u1', 'p1');
    const restored = splitFromCloudTransaction({
      transaction_id: row.transaction_id,
      portfolio_id: row.portfolio_id,
      type: 'SPLIT', symbol: row.symbol, currency: row.currency,
      split_numerator: row.split_numerator, split_denominator: row.split_denominator,
      executed_at: row.executed_at, recorded_at: row.recorded_at, created_at: null,
      client_request_id: row.client_request_id,
    });
    expect(restored).toEqual(split);
  });
});
