/**
 * Historical returns helpers.
 *
 * Methodology: apply CURRENT market weights to each asset's aligned adjusted
 * return series. This is a constant-mix historical risk proxy, not a
 * reconstruction of the portfolio's actual historical NAV or quantities.
 */

import type { HistoryBar, Position } from '../types';
import type { DatedReturn } from '../types/analytics';
import { datedReturns } from './performance';

export interface PortfolioReturnSeries {
  dates: string[];
  values: number[];
  returns: DatedReturn[];
  dailyReturns: number[];
  available: boolean;
  reason?: string;
}

export function buildCurrentHoldingsRiskProxy(
  positions: Position[],
  historyBySymbol: Map<string, HistoryBar[]>,
  suppliedWeights?: number[],
): PortfolioReturnSeries {
  if (positions.length === 0) return unavailable('empty_portfolio');

  const returnMaps = new Map<string, Map<string, DatedReturn>>();
  let commonIntervals: string[] | null = null;

  for (const pos of positions) {
    const bars = historyBySymbol.get(pos.symbol);
    if (!bars || bars.length < 2) {
      return unavailable(`insufficient_history_for_${pos.symbol}`);
    }

    const returns = datedReturns(bars);
    const intervalMap = new Map(
      returns.map((r) => [`${r.startDate}/${r.date}`, r]),
    );
    returnMaps.set(pos.symbol, intervalMap);

    const intervalKeys = [...intervalMap.keys()];
    commonIntervals =
      commonIntervals === null
        ? intervalKeys
        : commonIntervals.filter((key) => intervalMap.has(key));
  }

  if (!commonIntervals || commonIntervals.length === 0) {
    return unavailable('insufficient_common_return_intervals');
  }

  let weights = suppliedWeights;
  if (!weights) {
    const marketValues = positions.map((position) => position.marketValue);
    if (marketValues.every((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
      const total = marketValues.reduce((sum, value) => sum + value, 0);
      weights = total > 0 ? marketValues.map((value) => value / total) : undefined;
    }
    if (!weights) {
      const latestValues = positions.map((position) => {
        const bars = historyBySymbol.get(position.symbol) ?? [];
        const latest = bars.filter((bar) => Number.isFinite(bar.close) && bar.close > 0).at(-1)?.close;
        return latest === undefined ? null : latest * position.quantity;
      });
      if (latestValues.every((value): value is number => value !== null && Number.isFinite(value) && value >= 0)) {
        const total = latestValues.reduce((sum, value) => sum + value, 0);
        weights = total > 0 ? latestValues.map((value) => value / total) : undefined;
      }
    }
  }
  if (!weights || weights.length !== positions.length || weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    return unavailable('missing_current_market_weights');
  }
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(weightTotal - 1) > 1e-8) return unavailable('invalid_current_market_weights');

  const returns: DatedReturn[] = commonIntervals
    .map((key) => {
      let value = 0;
      for (let index = 0; index < positions.length; index += 1) {
        const observation = returnMaps.get(positions[index].symbol)?.get(key);
        if (!observation || !Number.isFinite(observation.value)) return null;
        value += weights![index] * observation.value;
      }
      const [startDate, date] = key.split('/');
      return Number.isFinite(value) && value >= -1 ? { startDate, date, value } : null;
    })
    .filter((result): result is DatedReturn => result !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (returns.length === 0) {
    return unavailable('insufficient_clean_history');
  }

  let wealth = 100;
  const dates = [returns[0].startDate, ...returns.map((item) => item.date)];
  const values = [wealth, ...returns.map((item) => (wealth *= 1 + item.value))];

  return {
    dates,
    values,
    returns,
    dailyReturns: returns.map((r) => r.value),
    available: true,
  };
}

function unavailable(reason: string): PortfolioReturnSeries {
  return {
    dates: [],
    values: [],
    returns: [],
    dailyReturns: [],
    available: false,
    reason,
  };
}

/** @deprecated Compatibility alias; this is never actual portfolio performance. */
export const buildPortfolioValueSeries = buildCurrentHoldingsRiskProxy;
