import type { BenchmarkMetrics, DatedReturn } from '../types/analytics';
import { cumulativeReturn } from './performance';
import {
  annualRateToDaily,
  covariance,
  EPSILON,
  finite,
  mean,
  MIN_OBSERVATIONS,
  safeRatio,
  validDate,
  volatility,
} from './statistics';

export function alignReturns(a: DatedReturn[], b: DatedReturn[]) {
  const clean = (rs: DatedReturn[]) =>
    rs.every(
      (r, i) =>
        validDate(r.date) &&
        validDate(r.startDate) &&
        r.startDate < r.date &&
        Number.isFinite(r.value) &&
        r.value >= -1 &&
        (i === 0 || r.date > rs[i - 1].date),
    );
  if (!clean(a) || !clean(b)) return [];
  const map = new Map(b.map((r) => [`${r.startDate}/${r.date}`, r]));
  return a.flatMap((r) => {
    const other = map.get(`${r.startDate}/${r.date}`);
    return other
      ? [
          {
            date: r.date,
            startDate: r.startDate,
            portfolio: r.value,
            benchmark: other.value,
          },
        ]
      : [];
  });
}

export function benchmarkMetrics(
  portfolio: DatedReturn[],
  benchmark: DatedReturn[],
  annualRf = 0,
): BenchmarkMetrics {
  const aligned = alignReturns(portfolio, benchmark);
  const p = aligned.map((r) => r.portfolio);
  const b = aligned.map((r) => r.benchmark);
  const variance = covariance(b, b);
  const beta =
    variance !== null && variance > EPSILON
      ? safeRatio(covariance(p, b), variance)
      : null;
  const pm = mean(p);
  const bm = mean(b);
  const dailyRf = annualRateToDaily(annualRf);
  const active = p.map((r, i) => r - b[i]);
  const trackingError = volatility(active);
  const alpha =
    beta === null || pm === null || bm === null || dailyRf === null
      ? null
      : finite((pm - dailyRf - beta * (bm - dailyRf)) * 252);
  const averageActive = mean(active);
  const informationRatio =
    averageActive === null
      ? null
      : safeRatio(averageActive * 252, trackingError);

  // Cumulative benchmark comparison is only valid across a continuous chain.
  // Regression/risk statistics may still use clean aligned fragments.
  const continuous =
    aligned.length > 0 &&
    aligned.length === portfolio.length &&
    aligned.every((r, i) => i === 0 || r.startDate === aligned[i - 1].date);
  let pv = 100;
  let bv = 100;
  const comparison = continuous
    ? [
        { date: aligned[0].startDate, portfolio: pv, benchmark: bv },
        ...aligned.map((r) => ({
          date: r.date,
          portfolio: (pv *= 1 + r.portfolio),
          benchmark: (bv *= 1 + r.benchmark),
        })),
      ]
    : [];
  const safeComparison = comparison.every(
    (r) => Number.isFinite(r.portfolio) && Number.isFinite(r.benchmark),
  )
    ? comparison
    : [];

  return {
    beta,
    alpha,
    trackingError: p.length >= MIN_OBSERVATIONS ? trackingError : null,
    informationRatio:
      p.length >= MIN_OBSERVATIONS ? informationRatio : null,
    portfolioReturn: continuous ? cumulativeReturn(p) : null,
    benchmarkReturn: continuous ? cumulativeReturn(b) : null,
    observations: aligned.length,
    comparison: safeComparison,
  };
}
