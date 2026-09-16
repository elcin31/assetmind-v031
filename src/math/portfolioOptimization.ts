import { portfolioVariance } from './covariance';
import { riskContributions } from './riskContribution';

const EPS = 1e-12;

export interface OptimizationWeight {
  symbol: string;
  currentWeight: number;
  optimizedWeight: number;
  delta: number;
}

export interface MinimumVarianceResult {
  symbols: string[];
  currentWeights: number[];
  optimizedWeights: number[];
  weights: OptimizationWeight[];
  currentVolatility: number;
  optimizedVolatility: number;
  volatilityReduction: number;
  turnover: number;
  currentDiversificationRatio: number | null;
  optimizedDiversificationRatio: number | null;
  currentEffectiveRiskBets: number | null;
  optimizedEffectiveRiskBets: number | null;
  iterations: number;
}

function validCovariance(matrix: number[][], n: number): boolean {
  if (matrix.length !== n || matrix.some((row) => row.length !== n)) return false;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(matrix[i][i]) || matrix[i][i] <= 0) return false;
    for (let j = 0; j < n; j++) {
      if (!Number.isFinite(matrix[i][j])) return false;
      const tolerance = Math.max(1e-10, Math.abs(matrix[i][j]) * 1e-8, Math.abs(matrix[j]?.[i] ?? 0) * 1e-8);
      if (Math.abs(matrix[i][j] - matrix[j][i]) > tolerance) return false;
    }
  }
  return true;
}

/** Euclidean projection onto {w >= 0, sum(w)=1}. */
export function projectToSimplex(values: number[]): number[] | null {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  const sorted = [...values].sort((a, b) => b - a);
  let cumulative = 0;
  let rho = -1;
  let theta = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i];
    const candidate = (cumulative - 1) / (i + 1);
    if (sorted[i] - candidate > 0) {
      rho = i;
      theta = candidate;
    }
  }
  if (rho < 0) return null;
  const projected = values.map((value) => Math.max(0, value - theta));
  const total = projected.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return null;
  return projected.map((value) => value / total);
}

function matrixVector(matrix: number[][], vector: number[]) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

/**
 * Convex long-only minimum-variance portfolio using projected gradient descent.
 * No expected returns are estimated. The input covariance is assumed to be a
 * sample covariance matrix from the same aligned observations for all assets.
 */
export function minimumVarianceWeights(
  covariance: number[][],
  initial?: number[],
): { weights: number[]; iterations: number } | null {
  const n = covariance.length;
  if (!n || !validCovariance(covariance, n)) return null;
  if (n === 1) return { weights: [1], iterations: 0 };

  let weights = projectToSimplex(initial?.length === n ? initial : Array(n).fill(1 / n));
  if (!weights) return null;

  // 2 * max absolute row sum is a safe upper bound for the gradient Lipschitz constant.
  const lipschitz = 2 * Math.max(...covariance.map((row) => row.reduce((sum, value) => sum + Math.abs(value), 0)));
  if (!(lipschitz > EPS) || !Number.isFinite(lipschitz)) return null;
  const step = 1 / lipschitz;

  let iterations = 0;
  for (; iterations < 20_000; iterations++) {
    const gradient = matrixVector(covariance, weights).map((value) => 2 * value);
    const next = projectToSimplex(weights.map((weight, i) => weight - step * gradient[i]));
    if (!next) return null;
    const maxChange = Math.max(...next.map((value, i) => Math.abs(value - weights![i])));
    weights = next;
    if (maxChange < 1e-11) break;
  }

  const variance = portfolioVariance(weights, covariance);
  if (variance === null || variance <= 0) return null;
  return { weights, iterations };
}

function effectiveRiskBets(fractions: number[]): number | null {
  const absolute = fractions.map(Math.abs);
  const total = absolute.reduce((sum, value) => sum + value, 0);
  if (!(total > EPS)) return null;
  const normalized = absolute.map((value) => value / total);
  const hhi = normalized.reduce((sum, value) => sum + value * value, 0);
  return hhi > EPS ? 1 / hhi : null;
}

export function minimumVariancePortfolio(
  symbols: string[],
  currentWeights: number[],
  covariance: number[][],
): MinimumVarianceResult | null {
  if (!symbols.length || symbols.length !== currentWeights.length || new Set(symbols).size !== symbols.length) return null;
  const current = projectToSimplex(currentWeights);
  if (!current || !validCovariance(covariance, symbols.length)) return null;
  const optimized = minimumVarianceWeights(covariance, current);
  if (!optimized) return null;

  const currentRisk = riskContributions(symbols, current, covariance);
  const optimizedRisk = riskContributions(symbols, optimized.weights, covariance);
  if (!currentRisk || !optimizedRisk) return null;

  const currentVolatility = currentRisk.volatility;
  const optimizedVolatility = optimizedRisk.volatility;
  const turnover = current.reduce((sum, weight, index) => sum + Math.abs(optimized.weights[index] - weight), 0) / 2;

  return {
    symbols,
    currentWeights: current,
    optimizedWeights: optimized.weights,
    weights: symbols.map((symbol, index) => ({
      symbol,
      currentWeight: current[index],
      optimizedWeight: optimized.weights[index],
      delta: optimized.weights[index] - current[index],
    })),
    currentVolatility,
    optimizedVolatility,
    volatilityReduction: currentVolatility > EPS ? 1 - optimizedVolatility / currentVolatility : 0,
    turnover,
    currentDiversificationRatio: currentRisk.diversificationRatio,
    optimizedDiversificationRatio: optimizedRisk.diversificationRatio,
    currentEffectiveRiskBets: effectiveRiskBets(currentRisk.contributions.map((item) => item.fraction)),
    optimizedEffectiveRiskBets: effectiveRiskBets(optimizedRisk.contributions.map((item) => item.fraction)),
    iterations: optimized.iterations,
  };
}
