import type { BenchmarkMetrics, DatedReturn } from '../types/analytics';
import { cumulativeReturn } from './performance';
import { correlation } from './correlation';
import { alignReturns } from './returnAlignment';
export { alignReturns } from './returnAlignment';
import {
  annualRateToDaily,
  covariance,
  EPSILON,
  finite,
  mean,
  MIN_OBSERVATIONS,
  safeRatio,
  volatility,
} from './statistics';

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
    aligned.length >= MIN_OBSERVATIONS && variance !== null && variance > EPSILON
      ? safeRatio(covariance(p, b), variance)
      : null;
  const pm = mean(p);
  const bm = mean(b);
  const dailyRf = annualRateToDaily(annualRf);
  const active = p.map((r, i) => r - b[i]);
  const trackingError = volatility(active);
  const alpha =
    aligned.length < MIN_OBSERVATIONS || beta === null || pm === null || bm === null || dailyRf === null
      ? null
      : finite((pm - dailyRf - beta * (bm - dailyRf)) * 252);
  const averageActive = mean(active);
  const informationRatio =
    averageActive === null
      ? null
      : safeRatio(averageActive * 252, trackingError);
  const correlationValue = correlation(p, b);
  const capture = (upside: boolean) => {
    const selected = aligned.filter(r => upside ? r.benchmark > 0 : r.benchmark < 0);
    if (selected.length < MIN_OBSERVATIONS) return null;
    const portfolioReturn = cumulativeReturn(selected.map(r => r.portfolio));
    const benchmarkReturn = cumulativeReturn(selected.map(r => r.benchmark));
    return portfolioReturn === null || benchmarkReturn === null || Math.abs(benchmarkReturn) <= EPSILON
      ? null
      : finite(portfolioReturn / benchmarkReturn);
  };

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

  const portfolioReturn = continuous ? cumulativeReturn(p) : null;
  const benchmarkReturn = continuous ? cumulativeReturn(b) : null;
  return {
    beta,
    alpha,
    trackingError: p.length >= MIN_OBSERVATIONS ? trackingError : null,
    informationRatio:
      p.length >= MIN_OBSERVATIONS ? informationRatio : null,
    portfolioReturn,
    benchmarkReturn,
    activeReturn: portfolioReturn !== null && benchmarkReturn !== null ? finite(portfolioReturn - benchmarkReturn) : null,
    correlation: p.length >= MIN_OBSERVATIONS ? correlationValue : null,
    upsideCapture: capture(true),
    downsideCapture: capture(false),
    observations: aligned.length,
    comparison: safeComparison,
  };
}
