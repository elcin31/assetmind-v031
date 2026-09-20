import { describe, expect, it } from 'vitest';
import { tradeTransactions } from '../src/math/securityLedger';
import type { Transaction } from '../src/types';

describe('trade projection purity', () => {
  it('does not mutate input ledger rows', () => {
    const rows: Transaction[] = [{ id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }];
    const before = structuredClone(rows);
    tradeTransactions(rows);
    expect(rows).toEqual(before);
  });
});
