/**
 * P&L engine — pure functions.
 * Uses positions produced by the position engine + current market prices.
 */

import type { Position, Quote, Transaction } from '../types';
import { calculatePositionsWithTotals } from './positions';

export interface EnrichedPortfolio {
  positions: Position[];
  portfolioValue: number;
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  allocation: { symbol: string; weight: number; marketValue: number }[];
  concentration: {
    largestPositionSymbol: string | null;
    largestPositionWeight: number;
    topHoldings: { symbol: string; weight: number }[];
  };
  valuation: {
    complete: boolean;
    pricedPositions: number;
    totalPositions: number;
    unpricedSymbols: string[];
  };
  hadInvalidSell: boolean;
}

/** Enrich open positions with market prices and compute portfolio aggregates. */
export function enrichPositionsWithQuotes(
  transactions: Transaction[],
  quotes: Map<string, Quote> | Record<string, Quote>
): EnrichedPortfolio {
  const { positions: openPositions, totalRealizedPnL, hadInvalidSell } =
    calculatePositionsWithTotals(transactions);

  const quoteMap = quotes instanceof Map ? quotes : new Map(Object.entries(quotes));

  let portfolioValue = 0;
  let unrealizedPnL = 0;
  const unpricedSymbols: string[] = [];

  const enriched: Position[] = openPositions.map((pos) => {
    const q = quoteMap.get(pos.symbol);
    const marketPrice = q?.price;
    const marketValue = marketPrice !== undefined
      ? round(pos.quantity * marketPrice)
      : undefined;
    const unrlzd = marketValue !== undefined
      ? round(marketValue - pos.costBasis)
      : undefined;
    const total = unrlzd !== undefined
      ? round(pos.realizedPnL + unrlzd)
      : undefined;

    if (marketValue !== undefined) {
      portfolioValue += marketValue;
      unrealizedPnL += unrlzd ?? 0;
    } else {
      unpricedSymbols.push(pos.symbol);
    }

    return {
      ...pos,
      marketPrice,
      marketValue,
      unrealizedPnL: unrlzd,
      totalPnL: total,
    };
  });

  portfolioValue = round(portfolioValue);
  unrealizedPnL = round(unrealizedPnL);
  const totalPnL = round(totalRealizedPnL + unrealizedPnL);

  const allocation = enriched
    .filter((p) => p.marketValue !== undefined && portfolioValue > 0)
    .map((p) => ({
      symbol: p.symbol,
      weight: round(p.marketValue! / portfolioValue),
      marketValue: p.marketValue!,
    }))
    .sort((a, b) => b.weight - a.weight);

  const weightMap = new Map(allocation.map((a) => [a.symbol, a.weight]));
  for (const p of enriched) {
    p.weight = weightMap.get(p.symbol);
  }

  const largest = allocation[0] ?? null;
  const topHoldings = allocation.slice(0, 5).map((a) => ({
    symbol: a.symbol,
    weight: a.weight,
  }));

  return {
    positions: enriched,
    portfolioValue,
    totalPnL,
    realizedPnL: totalRealizedPnL,
    unrealizedPnL,
    allocation,
    concentration: {
      largestPositionSymbol: largest?.symbol ?? null,
      largestPositionWeight: largest?.weight ?? 0,
      topHoldings,
    },
    valuation: {
      complete: unpricedSymbols.length === 0,
      pricedPositions: enriched.length - unpricedSymbols.length,
      totalPositions: enriched.length,
      unpricedSymbols,
    },
    hadInvalidSell,
  };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
