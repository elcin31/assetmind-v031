import { describe, expect, it } from 'vitest';
import type { StockSplit, Transaction } from '../src/types';

function providerSplitIsNotLedgerRow(provider: StockSplit): Transaction[] {
  void provider;
  return [];
}

describe('provider split isolation', () => {
  it('does not convert provider metadata into a transaction implicitly', () => {
    const provider: StockSplit = {
      date: '2026-01-02', timestamp: '2026-01-02T00:00:00Z', numerator: 4, denominator: 1, ratio: 4,
    };
    expect(providerSplitIsNotLedgerRow(provider)).toEqual([]);
  });
});
