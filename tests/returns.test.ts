import { describe, expect, it } from 'vitest';
import { buildPortfolioValueSeries } from '../src/math/returns';
import type { HistoryBar, Position } from '../src/types';

function position(symbol: string, quantity: number): Position {
  return {
    symbol,
    quantity,
    averageCost: 100,
    costBasis: 100 * quantity,
    realizedPnL: 0,
  };
}

function bars(values: number[]): HistoryBar[] {
  return values.map((close, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    close,
  }));
}

describe('buildPortfolioValueSeries', () => {
  it('builds current-holdings historical values on common dates', () => {
    const history = new Map<string, HistoryBar[]>([
      ['AAPL', bars([100, 101, 102, 103, 104])],
      ['MSFT', bars([200, 201, 202, 203, 204])],
    ]);

    const result = buildPortfolioValueSeries(
      [position('AAPL', 2), position('MSFT', 1)],
      history
    );

    expect(result.available).toBe(true);
    expect(result.values).toEqual([400, 403, 406, 409, 412]);
    expect(result.dailyReturns).toHaveLength(4);
  });

  it('returns unavailable if a position has insufficient history', () => {
    const history = new Map<string, HistoryBar[]>([['AAPL', bars([100])]]);
    const result = buildPortfolioValueSeries([position('AAPL', 1)], history);
    expect(result.available).toBe(false);
    expect(result.reason).toContain('AAPL');
  });
});
