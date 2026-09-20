import { describe, expect, it } from 'vitest';
import type { StockSplit } from '../src/types';
import { applyStockSplit, validateStockSplit } from '../src/math/corporateActions';

const split = (numerator: number, denominator: number): StockSplit => ({
  date: '2026-06-01',
  timestamp: '2026-06-01T00:00:00Z',
  numerator,
  denominator,
  ratio: numerator / denominator,
});

describe('corporate actions', () => {
  it('preserves cost basis across a 2:1 forward split', () => {
    const adjusted = applyStockSplit(10, 100, split(2, 1));
    expect(adjusted).not.toBeNull();
    expect(adjusted!.quantity).toBe(20);
    expect(adjusted!.averageCost).toBe(50);
    expect(adjusted!.costBasis).toBe(1000);
  });

  it('preserves cost basis across a 1:4 reverse split', () => {
    const adjusted = applyStockSplit(20, 50, split(1, 4));
    expect(adjusted).not.toBeNull();
    expect(adjusted!.quantity).toBe(5);
    expect(adjusted!.averageCost).toBe(200);
    expect(adjusted!.costBasis).toBe(1000);
  });

  it('rejects malformed or internally inconsistent split ratios', () => {
    expect(validateStockSplit({ ...split(2, 1), ratio: 3 })).toBe(false);
    expect(validateStockSplit(split(1, 1))).toBe(false);
    expect(applyStockSplit(10, 100, { ...split(2, 1), numerator: 0 })).toBeNull();
  });

  it('does not create value for an empty position', () => {
    expect(applyStockSplit(0, 0, split(10, 1))).toEqual({
      quantity: 0,
      averageCost: 0,
      costBasis: 0,
    });
  });
});
