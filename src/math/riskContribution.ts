import type { RiskContribution } from '../types/analytics';
import { portfolioVariance } from './covariance';
import { EPSILON, finite } from './statistics';
export function riskContributions(symbols: string[], weights: number[], matrix: number[][]) {
  if (symbols.length !== weights.length || new Set(symbols).size !== symbols.length) return null;
  const variance = portfolioVariance(weights, matrix);
  if (variance === null || variance <= EPSILON) return null;
  const volatility = Math.sqrt(variance);
  const contributions: RiskContribution[] = weights.map((weight, i) => {
    const marginal = matrix[i].reduce((sum, cov, j) => sum + cov * weights[j], 0) / volatility;
    const absolute = weight * marginal;
    return { symbol: symbols[i], weight, marginal, absolute, fraction: absolute / volatility };
  });
  if (contributions.some(c => !Number.isFinite(c.fraction) || !Number.isFinite(c.absolute) || !Number.isFinite(c.marginal))) return null;
  const diversificationRatio = finite(weights.reduce((sum, w, i) => sum + w * Math.sqrt(matrix[i][i]), 0) / volatility);
  return { volatility, variance, contributions, diversificationRatio };
}
