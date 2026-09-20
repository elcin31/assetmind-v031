import { describe, expect, it } from 'vitest';
import { canSell } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('canSell input validation with split history', () => {
  it('rejects zero and negative requested quantities', () => {
    const rows: Transaction[] = [{ id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }];
    expect(canSell(rows, 'XYZ', 0)).toBe(false);
    expect(canSell(rows, 'XYZ', -1)).toBe(false);
  });
});
