import type { DatedReturn } from '../types/analytics';
import { sharpeRatio } from './ratios';
import { MIN_OBSERVATIONS, validDate, volatility } from './statistics';

function contiguousWindow(returns: DatedReturn[]): boolean {
  return returns.every(
    (r, i) => i === 0 || r.startDate === returns[i - 1].date,
  );
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
