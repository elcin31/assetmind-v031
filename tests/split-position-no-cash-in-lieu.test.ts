import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('fractional split cash-in-lieu policy', () => {
  it('keeps fractional inventory and creates no implicit cash', () => {
    const rows: Transaction[] = [
      { id: 'a', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 7, price: 10, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 1, split_denominator: 2, currency: 'USD', timestamp: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' },
    ];
    expect(calculatePositions(rows).positions[0].quantity).toBe(3.5);
    expect(buildCashLedger(rows, [], '2026-01-03T00:00:00Z', 'USD').entries.some((entry) => entry.kind === 'SPLIT')).toBe(false);
  });
});
