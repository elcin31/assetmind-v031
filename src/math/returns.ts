/**
 * Historical returns helpers.
 *
 * Methodology: revalue the CURRENT open quantities across historical closes.
 * This is a historical risk proxy for today's holdings mix. It is not a
 * reconstruction of the portfolio's actual historical NAV when quantities
 * changed over time.
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
): PortfolioReturnSeries {
  if (positions.length === 0) return unavailable('empty_portfolio');

  const priceMaps = new Map<string, Map<string, number>>();
  const returnMaps = new Map<string, Map<string, DatedReturn>>();
  let commonDates: string[] | null = null;
  let commonIntervals: string[] | null = null;

  for (const pos of positions) {
    const bars = historyBySymbol.get(pos.symbol);
    if (!bars || bars.length < 2) {
      return unavailable(`insufficient_history_for_${pos.symbol}`);
    }

    const priceMap = new Map(
      bars
        .filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
        .map((bar) => [bar.date, bar.close]),
    );
    const returns = datedReturns(bars);
    const intervalMap = new Map(
      returns.map((r) => [`${r.startDate}/${r.date}`, r]),
    );
    priceMaps.set(pos.symbol, priceMap);
    returnMaps.set(pos.symbol, intervalMap);

    const dates = [...priceMap.keys()].sort();
    commonDates =
      commonDates === null
        ? dates
        : commonDates.filter((date) => priceMap.has(date));

    const intervalKeys = [...intervalMap.keys()];
    commonIntervals =
      commonIntervals === null
        ? intervalKeys
        : commonIntervals.filter((key) => intervalMap.has(key));
  }

  if (!commonDates || commonDates.length < 2) {
    return unavailable('insufficient_common_history');
  }
  if (!commonIntervals || commonIntervals.length === 0) {
    return unavailable('insufficient_common_return_intervals');
  }

  const dates: string[] = [];
  const values: number[] = [];
  for (const date of commonDates) {
    let dayValue = 0;
    let valid = true;
    for (const pos of positions) {
      const price = priceMaps.get(pos.symbol)?.get(date);
      if (price === undefined || !Number.isFinite(price) || price <= 0) {
        valid = false;
        break;
      }
      dayValue += pos.quantity * price;
    }
    if (valid && Number.isFinite(dayValue) && dayValue > 0) {
      dates.push(date);
      values.push(dayValue);
    }
  }

  const returns: DatedReturn[] = commonIntervals
    .map((key) => {
      const [startDate, date] = key.split('/');
      let startValue = 0;
      let endValue = 0;
      for (const pos of positions) {
        const start = priceMaps.get(pos.symbol)?.get(startDate);
        const end = priceMaps.get(pos.symbol)?.get(date);
        if (
          start === undefined ||
          end === undefined ||
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start <= 0 ||
          end <= 0
        )
          return null;
        startValue += pos.quantity * start;
        endValue += pos.quantity * end;
      }
      if (
        !Number.isFinite(startValue) ||
        !Number.isFinite(endValue) ||
        startValue <= 0 ||
        endValue <= 0
      )
        return null;
      const value = endValue / startValue - 1;
      return Number.isFinite(value) && value >= -1
        ? { startDate, date, value }
        : null;
    })
    .filter((r): r is DatedReturn => r !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (values.length < 2 || returns.length === 0) {
    return unavailable('insufficient_clean_history');
  }

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
