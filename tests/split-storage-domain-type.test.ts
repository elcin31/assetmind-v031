import { describe, expect, it } from 'vitest';
import type { SplitTransaction, TradeTransaction } from '../src/types';

describe('security ledger domain types', () => {
  it('keeps split ratio and trade notional in separate payloads', () => {
    const split: SplitTransaction = { id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' };
    const trade: TradeTransaction = { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 1, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' };
    expect(split.type).not.toBe(trade.type);
  });
});
