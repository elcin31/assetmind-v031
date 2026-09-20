import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('split ledger chronology', () => {
  it('applies only events supplied by the caller and invents no future split', () => {
    const rows: Transaction[] = [{ id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 2, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }];
    expect(calculatePositions(rows).positions[0].quantity).toBe(2);
  });
});
