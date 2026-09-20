import { describe, expect, it } from 'vitest';
import { tradeTransactions } from '../src/math/securityLedger';
import type { Transaction } from '../src/types';

describe('cash trade projection payload', () => {
  it('keeps quantity and price on projected trades', () => {
    const rows: Transaction[] = [{ id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 2, price: 15, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }];
    expect(tradeTransactions(rows)[0]).toMatchObject({ quantity: 2, price: 15 });
  });
});
