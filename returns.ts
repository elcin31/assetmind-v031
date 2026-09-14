/**
 * Historical returns helpers.
 *
 * Methodology: revalue the CURRENT open quantities across historical closes.
 * This is a historical risk proxy for today's holdings mix. It is not a
 * reconstruction of the portfolio's actual historical NAV when quantities
 * changed over time.
 */

import type { HistoryBar, Position } from '../types';

export interface PortfolioReturnSeries {
  dates: string[];
  values: number[];
  dailyReturns: number[];
  available: boolean;
  reason?: string;
}

export function buildPortfolioValueSeries(
  positions: Position[],
  historyBySymbol: Map<string, HistoryBar[]>
): PortfolioReturnSeries {
  if (positions.length === 0) {
    return unavailable('empty_portfolio');
  }

  let commonDates: string[] | null = null;

  for (const pos of positions) {
    const bars = historyBySymbol.get(pos.symbol);
    if (!bars || bars.length < 2) {
      return unavailable(`insufficient_history_for_${pos.symbol}`);
    }

    const dates = new Set(
      bars
        .filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
        .map((bar) => bar.date)
    );

    if (commonDates === null) {
      commonDates = [...dates].sort();
    } else {
      commonDates = commonDates.filter((date) => dates.has(date));
    }
  }

  if (!commonDates || commonDates.length < 5) {
    return unavailable('insufficient_common_history');
  }

  const priceMaps = new Map<string, Map<string, number>>();
  for (const pos of positions) {
    const bars = historyBySymbol.get(pos.symbol)!;
    priceMaps.set(
      pos.symbol,
      new Map(
        bars
          .filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
          .map((bar) => [bar.date, bar.close])
      )
    );
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

  if (values.length < 5) {
    return unavailable('insufficient_clean_history');
  }

  const dailyReturns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const current = values[i];
    const dailyReturn = (current - prev) / prev;
    if (!Number.isFinite(dailyReturn)) {
      return unavailable('invalid_return_series');
    }
    dailyReturns.push(dailyReturn);
  }

  return { dates, values, dailyReturns, available: true };
}

function unavailable(reason: string): PortfolioReturnSeries {
  return {
    dates: [],
    values: [],
    dailyReturns: [],
    available: false,
    reason,
  };
}
