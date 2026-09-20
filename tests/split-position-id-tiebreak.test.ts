import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';
import type { Transaction } from '../src/types';

describe('split id tie break', () => {
  it('orders buy before split when ids sort that way', () => {
    const time = '2026-01-01T00:00:00Z';
    const rows: Transaction[] = [
      { id: '2-split', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1, currency: 'USD', timestamp: time, created_at: time },
      { id: '1-buy', portfolio_id: 'p', symbol: 'XYZ', type: 'BUY', quantity: 2, price: 10, currency: 'USD', timestamp: time, created_at: time },
    ];
    expect(calculatePositions(rows).positions[0].quantity).toBe(4);
  });
});
