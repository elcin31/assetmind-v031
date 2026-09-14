/**
 * Unit tests for the position engine.
 * Run with: npx vitest run tests/positions.test.ts
 * (vitest must be installed)
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePositions,
  calculatePositionsWithTotals,
  canSell,
} from '../src/math/positions';
import type { Transaction } from '../src/types';

function tx(
  symbol: string,
  type: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  timestamp = '2026-01-01T00:00:00Z'
): Transaction {
  return {
    id: crypto.randomUUID(),
    portfolio_id: 'p1',
    symbol,
    type,
    quantity,
    price,
    currency: 'USD',
    timestamp,
    created_at: timestamp,
  };
}

describe('calculatePositions', () => {
  it('single BUY', () => {
    const { positions } = calculatePositions([tx('AAPL', 'BUY', 10, 200)]);
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('AAPL');
    expect(positions[0].quantity).toBe(10);
    expect(positions[0].averageCost).toBe(200);
    expect(positions[0].costBasis).toBe(2000);
    expect(positions[0].realizedPnL).toBe(0);
  });

  it('multiple BUYs — weighted average', () => {
    const { positions } = calculatePositions([
      tx('AAPL', 'BUY', 10, 200, '2026-01-01T00:00:00Z'),
      tx('AAPL', 'BUY', 5, 220, '2026-01-02T00:00:00Z'),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe(15);
    // (10*200 + 5*220) / 15 = 3100/15 ≈ 206.666667
    expect(positions[0].averageCost).toBeCloseTo(206.666667, 5);
    expect(positions[0].costBasis).toBeCloseTo(3100, 5);
  });

  it('BUY then SELL — realized P&L', () => {
    const { positions, totalRealizedPnL } = calculatePositionsWithTotals([
      tx('AAPL', 'BUY', 10, 200, '2026-01-01T00:00:00Z'),
      tx('AAPL', 'SELL', 3, 230, '2026-01-02T00:00:00Z'),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe(7);
    expect(positions[0].averageCost).toBe(200);
    // realized = 3 * (230 - 200) = 90
    expect(totalRealizedPnL).toBe(90);
    expect(positions[0].realizedPnL).toBe(90);
  });

  it('invalid SELL is flagged', () => {
    const { hadInvalidSell, positions } = calculatePositions([
      tx('AAPL', 'BUY', 5, 100),
      tx('AAPL', 'SELL', 10, 120),
    ]);
    expect(hadInvalidSell).toBe(true);
    // Position remains the original 5 because invalid sell is skipped
    expect(positions[0].quantity).toBe(5);
  });

  it('multiple assets are independent', () => {
    const { positions } = calculatePositions([
      tx('AAPL', 'BUY', 10, 200),
      tx('NVDA', 'BUY', 4, 500),
      tx('AAPL', 'SELL', 2, 210),
    ]);
    const aapl = positions.find((p) => p.symbol === 'AAPL')!;
    const nvda = positions.find((p) => p.symbol === 'NVDA')!;
    expect(aapl.quantity).toBe(8);
    expect(nvda.quantity).toBe(4);
    expect(nvda.averageCost).toBe(500);
  });

  it('empty portfolio', () => {
    const { positions } = calculatePositions([]);
    expect(positions).toEqual([]);
  });

  it('normalizes symbols and uses deterministic ordering for equal timestamps', () => {
    const buy = tx('aapl', 'BUY', 10, 100, '2026-01-01T10:00:00Z');
    const sell = tx('AAPL', 'SELL', 5, 120, '2026-01-01T10:00:00Z');
    buy.id = 'a';
    sell.id = 'b';
    buy.created_at = '2026-01-01T10:00:01Z';
    sell.created_at = '2026-01-01T10:00:02Z';

    const { positions, hadInvalidSell } = calculatePositions([sell, buy]);
    expect(hadInvalidSell).toBe(false);
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('AAPL');
    expect(positions[0].quantity).toBe(5);
    expect(positions[0].realizedPnL).toBe(100);
  });

  it('canSell helper', () => {
    const txs = [tx('AAPL', 'BUY', 10, 200)];
    expect(canSell(txs, 'AAPL', 5)).toBe(true);
    expect(canSell(txs, 'AAPL', 10)).toBe(true);
    expect(canSell(txs, 'AAPL', 11)).toBe(false);
    expect(canSell(txs, 'NVDA', 1)).toBe(false);
  });
});
