import { describe, expect, it } from 'vitest';
import type { Transaction } from '../src/types';

function describeTransaction(tx: Transaction): string {
  if (tx.type === 'SPLIT') return `${tx.symbol} ${tx.split_numerator}:${tx.split_denominator}`;
  return `${tx.symbol} ${tx.type} ${tx.quantity}@${tx.price}`;
}

describe('Transaction discriminated union', () => {
  it('narrows trade and split payloads by type', () => {
    const split: Transaction = {
      id: 's', portfolio_id: 'p', symbol: 'AAPL', type: 'SPLIT', split_numerator: 4, split_denominator: 1,
      currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    };
    expect(describeTransaction(split)).toBe('AAPL 4:1');
  });
});
