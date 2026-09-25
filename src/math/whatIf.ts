import type { CorrelationMatrix, DatedReturn } from '../types/analytics';
import { benchmarkMetrics } from './benchmark';
import { concentration } from './lab';
import { portfolioVariance } from './covariance';
import { riskContributions } from './riskContribution';
import { averageCorrelation } from './correlation';
import { sharpeRatio } from './ratios';
import { MIN_OBSERVATIONS, finite } from './statistics';

export interface WhatIfMetrics {
  volatility: number | null;
  sharpe: number | null;
  beta: number | null;
  diversificationRatio: number | null;
  averageCorrelation: number | null;
  effectiveHoldings: number | null;
  largestPosition: number | null;
  largestRiskContributor: { symbol: string; contribution: number } | null;
  riskContributions: { symbol: string; weight: number; contribution: number }[];
  observations: number;
  reason: string | null;
}

/** Evaluate alternative weights against the existing shared risk window. */
export function evaluateWhatIfPortfolio(
  symbols: string[],
  weights: number[],
  matrix: CorrelationMatrix | null,
  benchmarkReturns: DatedReturn[],
  annualRiskFreeRate: number,
): WhatIfMetrics {
  const unavailable = (reason: string): WhatIfMetrics => ({
    volatility: null, sharpe: null, beta: null, diversificationRatio: null,
    averageCorrelation: null, effectiveHoldings: null, largestPosition: null,
    largestRiskContributor: null, riskContributions: [], observations: 0, reason,
  });
  if (!symbols.length || symbols.length !== weights.length || new Set(symbols).size !== symbols.length ||
      weights.some((value) => !Number.isFinite(value) || value < 0) ||
      Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) > 1e-8) {
    return unavailable('Scenario weights must be finite, non-negative, unique by asset and sum to 100%.');
  }
  if (!matrix || matrix.symbols.length !== symbols.length || matrix.symbols.some((symbol, index) => symbol !== symbols[index])) {
    return unavailable('Shared covariance window is unavailable for this portfolio.');
  }
  const variance = portfolioVariance(weights, matrix.covariance);
  const risk = variance === null ? null : riskContributions(symbols, weights, matrix.covariance);
  if (!risk || risk.volatility <= 1e-12) return unavailable('Scenario portfolio variance is zero or numerically undefined.');

  const assetMaps = matrix.returns.map((series) => new Map(series.map((item) => [`${item.startDate}/${item.date}`, item])));
  const benchmarkMap = new Map(benchmarkReturns.map((item) => [`${item.startDate}/${item.date}`, item]));
  const dates = matrix.returns[0]?.filter((item) => benchmarkMap.has(`${item.startDate}/${item.date}`)) ?? [];
  const portfolioReturns: DatedReturn[] = dates.map((interval) => ({
    ...interval,
    value: finite(weights.reduce((sum, weight, index) => sum + weight * (assetMaps[index].get(`${interval.startDate}/${interval.date}`)?.value ?? Number.NaN), 0)) ?? Number.NaN,
  }));
  const benchmarkAligned = dates.map((interval) => benchmarkMap.get(`${interval.startDate}/${interval.date}`)!);
  const beta = portfolioReturns.length >= MIN_OBSERVATIONS
    ? benchmarkMetrics(portfolioReturns, benchmarkAligned, annualRiskFreeRate).beta
    : null;
  const volatility = risk.volatility;
  const hhi = concentration(weights);
  const assetVolatility = risk.weightedAverageAssetVolatility;
  const diversificationRatio = symbols.length < 2 || assetVolatility === null ? null : finite(assetVolatility / volatility);
  const sharpe = portfolioReturns.length >= MIN_OBSERVATIONS
    ? sharpeRatio(portfolioReturns.map((item) => item.value), annualRiskFreeRate)
    : null;
  const largestRiskContributor = [...risk.contributions]
    .sort((a, b) => b.normalizedRC - a.normalizedRC)[0];

  return {
    volatility,
    sharpe,
    beta,
    diversificationRatio,
    averageCorrelation: averageCorrelation(matrix.correlation),
    effectiveHoldings: hhi?.effectivePositions ?? null,
    largestPosition: Math.max(...weights),
    largestRiskContributor: largestRiskContributor ? { symbol: largestRiskContributor.symbol, contribution: largestRiskContributor.normalizedRC } : null,
    riskContributions: risk.contributions.map((item) => ({ symbol: item.symbol, weight: item.weight, contribution: item.normalizedRC })),
    observations: portfolioReturns.length,
    reason: portfolioReturns.length < MIN_OBSERVATIONS ? `Benchmark metrics require ${MIN_OBSERVATIONS} common intervals; ${portfolioReturns.length} available.` : null,
  };
}

/** Explicit user action only. The editor never normalizes weights implicitly. */
export function normalizeScenarioWeights(weights: number[]): number[] | null {
  if (!weights.length || weights.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 1e-12) return null;
  const result = weights.map((value) => value / total);
  return result.every(Number.isFinite) ? result : null;
}
