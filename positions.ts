/**
 * Position engine — pure functions.
 * Methodology: Weighted Average Cost (WAC).
 *
 * BUY increases quantity and updates averageCost.
 * SELL reduces quantity at current averageCost and realizes P&L.
 * Invalid SELLs are flagged and ignored so corrupted history does not create
 * negative positions silently.
 */

import type { Position, Transaction } from '../types';

export interface PositionEngineResult {
  positions: Position[];
  /** True if any SELL exceeded the quantity available at that point in history. */
  hadInvalidSell: boolean;
}

interface PositionEngineWithTotalsResult extends PositionEngineResult {
  totalRealizedPnL: number;
}

export function compareTransactions(a: Transaction, b: Transaction): number {
  const timestampDiff = Date.parse(a.timestamp) - Date.parse(b.timestamp);
  if (Number.isFinite(timestampDiff) && timestampDiff !== 0) return timestampDiff;

  const createdAtDiff = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (Number.isFinite(createdAtDiff) && createdAtDiff !== 0) return createdAtDiff;

  return a.id.localeCompare(b.id);
}

function runPositionEngine(transactions: Transaction[]): PositionEngineWithTotalsResult {
  const bySymbol = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    const symbol = tx.symbol.trim().toUpperCase();
    const list = bySymbol.get(symbol) ?? [];
    list.push({ ...tx, symbol });
    bySymbol.set(symbol, list);
  }

  const positions: Position[] = [];
  let totalRealizedPnL = 0;
  let hadInvalidSell = false;

  for (const [symbol, txs] of bySymbol) {
    const sorted = [...txs].sort(compareTransactions);
    let quantity = 0;
    let averageCost = 0;
    let realizedPnL = 0;

    for (const tx of sorted) {
      if (tx.type === 'BUY') {
        const totalCost = quantity * averageCost + tx.quantity * tx.price;
        quantity += tx.quantity;
        averageCost = quantity > 0 ? totalCost / quantity : 0;
        continue;
      }

      if (tx.quantity > quantity + 1e-10) {
        hadInvalidSell = true;
        continue;
      }

      realizedPnL += tx.quantity * (tx.price - averageCost);
      quantity -= tx.quantity;

      if (quantity < 1e-10) {
        quantity = 0;
        averageCost = 0;
      }
    }

    totalRealizedPnL += realizedPnL;

    if (quantity > 1e-10) {
      positions.push({
        symbol,
        quantity: roundQty(quantity),
        averageCost: roundPrice(averageCost),
        costBasis: roundPrice(quantity * averageCost),
        realizedPnL: roundPrice(realizedPnL),
      });
    }
  }

  return {
    positions,
    totalRealizedPnL: roundPrice(totalRealizedPnL),
    hadInvalidSell,
  };
}

/** Calculate open positions from transaction history. Ordering is normalized internally. */
export function calculatePositions(transactions: Transaction[]): PositionEngineResult {
  const { positions, hadInvalidSell } = runPositionEngine(transactions);
  return { positions, hadInvalidSell };
}

/** Calculate open positions plus realized P&L across open and closed symbols. */
export function calculatePositionsWithTotals(transactions: Transaction[]): PositionEngineWithTotalsResult {
  return runPositionEngine(transactions);
}

/**
 * Convenience helper for a SELL at the end of the existing history.
 * Backdated/concurrent writes must be validated atomically by the database.
 */
export function canSell(
  transactions: Transaction[],
  symbol: string,
  sellQuantity: number
): boolean {
  if (!Number.isFinite(sellQuantity) || sellQuantity <= 0) return false;

  const normalized = symbol.trim().toUpperCase();
  const { positions } = calculatePositions(
    transactions.filter((t) => t.symbol.trim().toUpperCase() === normalized)
  );
  const pos = positions.find((p) => p.symbol === normalized);
  return Boolean(pos && pos.quantity + 1e-10 >= sellQuantity);
}

function roundQty(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function roundPrice(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
