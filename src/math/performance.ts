import type { HistoryBar } from '../types';
import type {
  DatedReturn,
  MonthlyReturn,
  Period,
  PortfolioHistoryPoint,
  PerformanceMetrics,
} from '../types/analytics';
import { EPSILON, finite, valid, validDate } from './statistics';

export function flowAdjustedReturn(
  previous: number,
  current: number,
  externalFlow: number | null,
): number | null {
  if (
    externalFlow === null ||
    !valid([previous, current, externalFlow]) ||
    previous <= EPSILON ||
    current < 0
  )
    return null;
  const r = (current - previous - externalFlow) / previous;
  return r < -1 ? null : finite(r);
}

/** Exact only for subperiod valuations around flows; EOD flows otherwise require explicit timing assumptions. */
export function timeWeightedReturn(returns: (number | null)[]): number | null {
  if (
    !returns.length ||
    returns.some((r) => r === null || !Number.isFinite(r) || r < -1)
  )
    return null;
  return finite(
    (returns as number[]).reduce((product, r) => product * (1 + r), 1) - 1,
  );
}

export const cumulativeReturn = timeWeightedReturn;

export function cagr(
  totalReturn: number | null,
  start: string,
  end: string,
): number | null {
  if (
    totalReturn === null ||
    !Number.isFinite(totalReturn) ||
    totalReturn < -1 ||
    !validDate(start) ||
    !validDate(end)
  )
    return null;
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  return days < 30 ? null : finite((1 + totalReturn) ** (365.25 / days) - 1);
}

export function datedReturns(bars: HistoryBar[]): DatedReturn[] {
  if (
    bars.some(
      (b, i) =>
        !validDate(b.date) ||
        !Number.isFinite(b.close) ||
        b.close <= 0 ||
        (i > 0 && b.date <= bars[i - 1].date),
    )
  )
    return [];
  return bars.slice(1).flatMap((b, i) => {
    const value = flowAdjustedReturn(bars[i].close, b.close, 0);
    return value === null
      ? []
      : [{ date: b.date, startDate: bars[i].date, value }];
  });
}

export function monthlyReturns(points: PortfolioHistoryPoint[]): MonthlyReturn[] {
  const buckets = new Map<string, (number | null)[]>();
  for (let i = 1; i < points.length; i++) {
    const key = points[i].date.slice(0, 7);
    const values = buckets.get(key) ?? [];
    values.push(points[i].dailyReturn);
    buckets.set(key, values);
  }
  return [...buckets].map(([key, returns]) => ({
    year: Number(key.slice(0, 4)),
    month: Number(key.slice(5)),
    value: cumulativeReturn(returns),
    observations: returns.length,
    ytdEligible: points[0].date < `${key.slice(0, 4)}-01-01`,
  }));
}

export function periodStart(period: Period, end: string): string {
  const d = new Date(`${end}T00:00:00Z`);
  if (!validDate(end)) return '';
  if (period === 'ALL') return '0001-01-01';
  if (period === 'YTD') return `${d.getUTCFullYear()}-01-01`;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(
    d.getUTCMonth() - { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[period],
  );
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/** Include last available close preceding boundary as the return baseline. */
export function selectPeriod<T extends { date: string }>(
  points: T[],
  period: Period,
  end: string,
): T[] {
  const start = periodStart(period, end);
  const endPoints = points.filter((p) => p.date <= end);
  const i = endPoints.findIndex((p) => p.date >= start);
  return i < 0
    ? []
    : endPoints.slice(Math.max(0, i - (endPoints[i].date === start ? 0 : 1)));
}

/**
 * Cumulative performance and historical risk deliberately use different streams.
 * A trade/gap makes cumulative TWR unavailable across that break, but clean
 * one-day market-return intervals before/after it remain valid for risk statistics.
 */
export function performanceMetrics(
  points: PortfolioHistoryPoint[],
): PerformanceMetrics {
  const invalid = points.some(
    (p, i) =>
      !validDate(p.date) ||
      !Number.isFinite(p.value) ||
      p.value < 0 ||
      (p.dailyReturn !== null &&
        (!Number.isFinite(p.dailyReturn) || p.dailyReturn < -1)) ||
      (i > 0 && p.date <= points[i - 1].date),
  );
  if (invalid)
    return {
      totalReturn: null,
      twr: null,
      cagr: null,
      bestDay: null,
      worstDay: null,
      positiveDays: null,
      negativeDays: null,
      returns: [],
      riskReturns: [],
      monthly: [],
      reason: 'Некорректная историческая серия.',
    };

  const candidates = points.slice(1);
  const riskReturns: DatedReturn[] = candidates.flatMap((p, i) =>
    p.dailyReturn === null
      ? []
      : [{ date: p.date, startDate: points[i].date, value: p.dailyReturn }],
  );
  const complete =
    candidates.length > 0 && candidates.every((p) => p.dailyReturn !== null);
  const returns = complete ? riskReturns : [];
  const cumulativeValues = returns.map((r) => r.value);
  const riskValues = riskReturns.map((r) => r.value);
  const totalReturn = complete ? cumulativeReturn(cumulativeValues) : null;

  return {
    totalReturn,
    twr: totalReturn,
    cagr:
      complete && points.length
        ? cagr(totalReturn, points[0].date, points.at(-1)!.date)
        : null,
    bestDay: riskValues.length ? Math.max(...riskValues) : null,
    worstDay: riskValues.length ? Math.min(...riskValues) : null,
    positiveDays: riskValues.length
      ? riskValues.filter((r) => r > 0).length / riskValues.length
      : null,
    negativeDays: riskValues.length
      ? riskValues.filter((r) => r < 0).length / riskValues.length
      : null,
    returns,
    riskReturns,
    monthly: monthlyReturns(points),
    reason: complete
      ? null
      : candidates.some((p) => p.traded)
        ? 'Период содержит BUY/SELL: exact TWR через trade-day требует subperiod valuation в момент сделки. AssetMind не выдаёт EOD approximation за фактическую доходность; чистые интервалы сохраняются для risk analytics, а MWR/XIRR считается отдельно по cash ledger.'
        : 'Cumulative performance недоступна из-за разрыва рыночной истории; пропущенные интервалы не считаются нулевыми и не соединяются.',
  };
}

export function historyReadouts(points: PortfolioHistoryPoint[]) {
  let wealth: number | null = 1;
  return points.map((p, i) => {
    if (i > 0)
      wealth =
        wealth === null || p.dailyReturn === null
          ? null
          : finite(wealth * (1 + p.dailyReturn));
    return {
      date: p.date,
      value: p.value,
      periodReturn: i === 0 || wealth === null ? null : wealth - 1,
    };
  });
}
