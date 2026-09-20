import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import { tradeTransactions } from '../src/math/securityLedger';
import type { CashEvent, Transaction } from '../src/types';

const buy: Transaction = {
  id: 'buy-1', portfolio_id: 'p1', symbol: 'AAPL', type: 'BUY', quantity: 10, price: 100,
  currency: 'USD', timestamp: '2026-01-01T10:00:00Z', created_at: '2026-01-01T10:00:01Z',
};
const split: Transaction = {
  id: 'split-1', portfolio_id: 'p1', symbol: 'AAPL', type: 'SPLIT', split_numerator: 4, split_denominator: 1,
  currency: 'USD', timestamp: '2026-01-02T10:00:00Z', created_at: '2026-01-02T10:00:01Z',
};
const deposit: CashEvent = {
  id: 'dep-1', portfolio_id: 'p1', kind: 'DEPOSIT', amount: 1000, currency: 'USD',
  timestamp: '2026-01-01T09:00:00Z', created_at: '2026-01-01T09:00:01Z',
};

describe('split-aware security ledger', () => {
  it('projects only BUY/SELL rows into cash accounting', () => {
    expect(tradeTransactions([buy, split])).toEqual([buy]);
  });

  it('does not create a cash movement for SPLIT', () => {
    const ledger = buildCashLedger([buy, split], [deposit], '2026-01-03T00:00:00Z', 'USD');
    expect(ledger.complete).toBe(true);
    expect(ledger.balance).toBe(0);
    expect(ledger.entries.map((entry) => entry.kind)).toEqual(['DEPOSIT', 'BUY']);
  });
});
