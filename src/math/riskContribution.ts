import type { RiskContribution } from '../types/analytics';
import { portfolioVariance } from './covariance';
import { EPSILON, finite } from './statistics';

export function riskContributions(
  symbols: string[],
  weights: number[],
  matrix: number[][],
) {
  if (
    symbols.length !== weights.length ||
    new Set(symbols).size !== symbols.length
  )
    return null;
  const variance = portfolioVariance(weights, matrix);
  if (variance === null || variance <= EPSILON) return null;
  const volatility = Math.sqrt(variance);
  const contributions: RiskContribution[] = weights.map((weight, i) => {
    const marginal = matrix[i].reduce(
      (sum, cov, j) => sum + cov * weights[j],
      0,
    );
    const absolute = weight * marginal;
    return {
      symbol: symbols[i],
      weight,
      marginal,
      absolute,
      fraction: absolute / variance,
    };
  });
  if (
    contributions.some(
      (c) =>
        !Number.isFinite(c.fraction) ||
        !Number.isFinite(c.absolute) ||
        !Number.isFinite(c.marginal),
    )
  )
    return null;

  const absoluteSum = contributions.reduce((sum, c) => sum + c.absolute, 0);
  const fractionSum = contributions.reduce((sum, c) => sum + c.fraction, 0);
  if (
    Math.abs(absoluteSum - variance) > Math.max(EPSILON, variance * 1e-8) ||
    Math.abs(fractionSum - 1) > 1e-8
  )
    return null;

  const diversificationRatio = finite(
    weights.reduce((sum, w, i) => sum + w * Math.sqrt(matrix[i][i]), 0) /
      volatility,
  );
  return { volatility, variance, contributions, diversificationRatio };
}
