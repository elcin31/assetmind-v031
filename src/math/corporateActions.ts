import type { StockSplit } from '../types';

const EPSILON = 1e-10;

export interface SplitAdjustedPosition {
  quantity: number;
  averageCost: number;
  costBasis: number;
}

export function validateStockSplit(split: StockSplit): boolean {
  return Boolean(
    split &&
    /^\d{4}-\d{2}-\d{2}$/.test(split.date) &&
    Number.isFinite(Date.parse(split.timestamp)) &&
    Number.isFinite(split.numerator) && split.numerator > 0 &&
    Number.isFinite(split.denominator) && split.denominator > 0 &&
    Number.isFinite(split.ratio) && split.ratio > 0 &&
    Math.abs(split.ratio - split.numerator / split.denominator) <= EPSILON &&
    Math.abs(split.ratio - 1) > EPSILON
  );
}

/**
 * Apply a stock split without inventing P&L. Quantity changes by the split
 * ratio, average cost changes inversely, and total cost basis is preserved.
 */
export function applyStockSplit(
  quantity: number,
  averageCost: number,
  split: StockSplit,
): SplitAdjustedPosition | null {
  if (
    !Number.isFinite(quantity) || quantity < 0 ||
    !Number.isFinite(averageCost) || averageCost < 0 ||
    !validateStockSplit(split)
  ) return null;

  const costBasis = quantity * averageCost;
  const nextQuantity = quantity * split.ratio;
  if (!Number.isFinite(nextQuantity) || nextQuantity < 0) return null;

  const nextAverageCost = nextQuantity > EPSILON ? costBasis / nextQuantity : 0;
  if (!Number.isFinite(nextAverageCost)) return null;

  return {
    quantity: nextQuantity,
    averageCost: nextAverageCost,
    costBasis,
  };
}
