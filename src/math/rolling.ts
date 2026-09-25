import type { DatedReturn } from '../types/analytics';
import { sharpeRatio } from './ratios';
import { MIN_OBSERVATIONS, validDate, volatility, covariance, safeRatio, EPSILON } from './statistics';
import { alignReturns } from './returnAlignment';
import { correlation } from './correlation';

function contiguousWindow(returns: DatedReturn[]): boolean {
  return returns.every(
    (r, i) => i === 0 || r.startDate === returns[i - 1].date,
  );
}

/** Rolling benchmark analytics on strictly aligned return intervals. */
export function rollingPairMetric(
  portfolio: DatedReturn[],
  benchmark: DatedReturn[],
  window: number,
  metric: 'beta' | 'correlation',
): { date: string; value: number | null; observations: number }[] {
  if (!Number.isInteger(window) || window < MIN_OBSERVATIONS) return [];
  const aligned = alignReturns(portfolio, benchmark);
  return aligned.map((row, index) => {
    if (index < window - 1) return { date: row.date, value: null, observations: 0 };
    const sample = aligned.slice(index - window + 1, index + 1);
    if (!contiguousWindow(sample.map(r => ({ date: r.date, startDate: r.startDate, value: r.portfolio })))) return { date: row.date, value: null, observations: 0 };
    const p = sample.map(r => r.portfolio);
    const b = sample.map(r => r.benchmark);
    const value = metric === 'beta'
      ? safeRatio(covariance(p, b), (() => { const v = covariance(b, b); return v !== null && v > EPSILON ? v : null; })())
      : correlation(p, b);
    return { date: row.date, value: value !== null && Number.isFinite(value) ? value : null, observations: window };
  });
}

export function rollingMetric(
  returns: DatedReturn[],
  window: number,
  metric: 'volatility' | 'sharpe',
  rf = 0,
): { date: string; value: number | null }[] {
  if (
    !Number.isInteger(window) ||
    window < MIN_OBSERVATIONS ||
    returns.some(
      (r, i) =>
        !validDate(r.date) ||
        !validDate(r.startDate) ||
        r.startDate >= r.date ||
        !Number.isFinite(r.value) ||
        r.value < -1 ||
        (i > 0 && r.date <= returns[i - 1].date),
    )
  )
    return [];

  return returns.map((r, i) => {
    if (i < window - 1) return { date: r.date, value: null };
    const sample = returns.slice(i - window + 1, i + 1);
    // A trade/missing interval breaks only windows that cross that break. We do
    // not bridge it, and a later clean window becomes calculable again.
    if (!contiguousWindow(sample)) return { date: r.date, value: null };
    const values = sample.map((p) => p.value);
    return {
      date: r.date,
      value:
        metric === 'volatility'
          ? volatility(values)
          : sharpeRatio(values, rf),
    };
  });
}
