import type { Position, Transaction } from "../types";
import { calculatePositionsWithTotals } from "./positions";
import { cumulativeReturn } from "./performance";
import { finite, valid } from "./statistics";
export function pnlAttribution(
  transactions: Transaction[],
  positions: Position[],
) {
  const symbols = [
    ...new Set(transactions.map((t) => t.symbol.trim().toUpperCase())),
  ];
  const rows = symbols.map((symbol) => {
    const engine = calculatePositionsWithTotals(
      transactions.filter((t) => t.symbol.trim().toUpperCase() === symbol),
    );
    const position = positions.find((p) => p.symbol === symbol);
    const realizedPnL = engine.hadInvalidSell
      ? null
      : finite(engine.totalRealizedPnL);
    const unrealizedPnL = engine.positions.length
      ? position?.unrealizedPnL === undefined
        ? null
        : finite(position.unrealizedPnL)
      : 0;
    return {
      symbol,
      realizedPnL,
      unrealizedPnL,
      totalPnL:
        realizedPnL === null || unrealizedPnL === null
          ? null
          : finite(realizedPnL + unrealizedPnL),
    };
  });
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.totalPnL ?? 0)));
  return rows
    .sort((a, b) => (b.totalPnL ?? -Infinity) - (a.totalPnL ?? -Infinity))
    .map((r) => ({
      ...r,
      barWidth:
        max && r.totalPnL !== null ? (Math.abs(r.totalPnL) / max) * 100 : 0,
    }));
}
/** Arithmetic contributions linked by preceding wealth; sums to compounded total return. */
export function returnAttribution(
  periods: { weights: number[]; returns: number[] }[],
): number[] | null {
  if (!periods.length) return null;
  const size = periods[0].weights.length;
  const totals = Array<number>(size).fill(0);
  let wealth = 1;
  for (const p of periods) {
    if (
      p.weights.length !== size ||
      p.returns.length !== size ||
      !valid(p.weights) ||
      !valid(p.returns) ||
      p.weights.some((w) => w < 0) ||
      p.returns.some((r) => r < -1) ||
      Math.abs(p.weights.reduce((a, b) => a + b, 0) - 1) > 1e-8
    )
      return null;
    const contributions = p.weights.map((w, i) => w * p.returns[i]);
    contributions.forEach((c, i) => {
      totals[i] += wealth * c;
    });
    const total = cumulativeReturn([contributions.reduce((a, b) => a + b, 0)]);
    if (total === null) return null;
    wealth *= 1 + total;
  }
  return totals.every(Number.isFinite) ? totals : null;
}
export function positionReturn(
  price: number | undefined,
  averageCost: number,
): number | null {
  return price === undefined ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isFinite(averageCost) ||
    averageCost <= 1e-12
    ? null
    : finite(price / averageCost - 1);
}
