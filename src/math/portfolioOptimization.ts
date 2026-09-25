import { portfolioVariance } from './covariance';
import { riskContributions } from './riskContribution';
import { finite } from './statistics';

const EPS = 1e-12;
export const FRONTIER_COVARIANCE_REGULARIZATION_RELATIVE_EPSILON = 1e-8;
const FRONTIER_REGULARIZATION_RETRY_MULTIPLIERS = [1, 10, 100, 1000] as const;

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

export interface EfficientFrontierPoint {
  weights: number[];
  annualizedReturn: number;
  annualizedVolatility: number;
  historicalSharpe: number | null;
}

export interface EfficientFrontierResult {
  symbols: string[];
  observations: number;
  points: EfficientFrontierPoint[];
  current: EfficientFrontierPoint;
  minimumVariance: EfficientFrontierPoint;
  maximumHistoricalSharpe: EfficientFrontierPoint;
  iterations: number;
  regularization: number;
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

function stableFrontierCovariance(matrix: number[][]): { matrix: number[][]; epsilon: number } | null {
  const n = matrix.length;
  if (!n || matrix.some((row) => row.length !== n || row.some((value) => !Number.isFinite(value))) ||
      matrix.some((row, i) => row[i] < 0 || row.some((value, j) => Math.abs(value - matrix[j][i]) > Math.max(1e-10, Math.abs(value) * 1e-8)))) return null;
  const scale = Math.max(...matrix.map((row, index) => row[index]));
  if (!Number.isFinite(scale) || scale <= EPS) return null;
  for (const multiplier of FRONTIER_REGULARIZATION_RETRY_MULTIPLIERS) {
    const epsilon = Math.max(EPS, scale * FRONTIER_COVARIANCE_REGULARIZATION_RELATIVE_EPSILON * multiplier);
    const adjusted = matrix.map((row, i) => row.map((value, j) => value + (i === j ? epsilon : 0)));
    if (validCovariance(adjusted, n) && portfolioVariance(Array(n).fill(1 / n), adjusted) !== null) return { matrix: adjusted, epsilon };
  }
  return null;
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

function frontierObjectiveWeights(covariance: number[][], meanReturns: number[], lambda: number, initial: number[]): { weights: number[]; iterations: number } | null {
  const n = covariance.length;
  let weights = projectToSimplex(initial);
  if (!weights) return null;
  const lipschitz = 2 * Math.max(...covariance.map((row) => row.reduce((sum, value) => sum + Math.abs(value), 0)));
  if (!(lipschitz > EPS) || !Number.isFinite(lipschitz)) return null;
  const step = 1 / lipschitz;
  let iterations = 0;
  for (; iterations < 20_000; iterations++) {
    const gradient = matrixVector(covariance, weights).map((value, index) => 2 * value - lambda * meanReturns[index]);
    const next = projectToSimplex(weights.map((weight, index) => weight - step * gradient[index]));
    if (!next || next.length !== n) return null;
    const change = Math.max(...next.map((weight, index) => Math.abs(weight - weights![index])));
    weights = next;
    if (change < 1e-10) break;
  }
  const variance = portfolioVariance(weights, covariance);
  return variance !== null && variance > EPS ? { weights, iterations } : null;
}

function frontierPoint(weights: number[], means: number[], covariance: number[][], riskFreeRate: number): EfficientFrontierPoint | null {
  const variance = portfolioVariance(weights, covariance);
  const annualizedReturn = finite(weights.reduce((sum, weight, index) => sum + weight * means[index], 0));
  if (variance === null || variance <= EPS || annualizedReturn === null) return null;
  const annualizedVolatility = finite(Math.sqrt(variance));
  if (annualizedVolatility === null || annualizedVolatility <= EPS) return null;
  return {
    weights: [...weights],
    annualizedReturn,
    annualizedVolatility,
    historicalSharpe: finite((annualizedReturn - riskFreeRate) / annualizedVolatility),
  };
}

/**
 * Deterministic long-only frontier from one fully aligned return panel.
 * The curve is a constrained variance/return sweep; historical Sharpe is
 * selected from that sweep plus all feasible single-asset vertices.
 */
export function efficientFrontier(
  symbols: string[],
  currentWeights: number[],
  dailyReturns: number[][],
  annualizedCovariance: number[][],
  annualRiskFreeRate = 0,
): EfficientFrontierResult | null {
  const n = symbols.length;
  const observations = dailyReturns[0]?.length ?? 0;
  if (n < 2 || n !== currentWeights.length || dailyReturns.length !== n || new Set(symbols).size !== n ||
      !Number.isFinite(annualRiskFreeRate) || observations < 20 ||
      dailyReturns.some((series) => series.length !== observations || series.some((value) => !Number.isFinite(value) || value < -1)) ||
      annualizedCovariance.length !== n) return null;
  const stable = stableFrontierCovariance(annualizedCovariance);
  if (!stable) return null;
  const covariance = stable.matrix;
  const current = projectToSimplex(currentWeights);
  if (!current || Math.abs(currentWeights.reduce((sum, value) => sum + value, 0) - 1) > 1e-8) return null;
  const means = dailyReturns.map((series) => finite(series.reduce((sum, value) => sum + value, 0) / series.length * 252));
  if (means.some((value) => value === null)) return null;
  const annualMeans = means as number[];
  const minResult = minimumVarianceWeights(covariance, current);
  if (!minResult) return null;
  const minPoint = frontierPoint(minResult.weights, annualMeans, covariance, annualRiskFreeRate);
  const currentPoint = frontierPoint(current, annualMeans, covariance, annualRiskFreeRate);
  if (!minPoint || !currentPoint) return null;

  const covarianceScale = Math.max(...covariance.flat().map(Math.abs));
  const returnScale = Math.max(...annualMeans.map(Math.abs), 1e-8);
  const lambdaScale = covarianceScale / returnScale;
  const candidates: EfficientFrontierPoint[] = [minPoint, currentPoint];
  let iterations = minResult.iterations;
  for (let index = 0; index <= 64; index++) {
    const lambda = index === 0 ? 0 : lambdaScale * 10 ** (-4 + index * (8 / 64));
    const optimized = frontierObjectiveWeights(covariance, annualMeans, lambda, minResult.weights);
    if (!optimized) continue;
    iterations += optimized.iterations;
    const point = frontierPoint(optimized.weights, annualMeans, covariance, annualRiskFreeRate);
    if (point) candidates.push(point);
  }
  for (let index = 0; index < n; index++) {
    const vertex = Array.from({ length: n }, (_, item) => item === index ? 1 : 0);
    const point = frontierPoint(vertex, annualMeans, covariance, annualRiskFreeRate);
    if (point) candidates.push(point);
  }

  const unique = new Map(candidates.map((point) => [point.weights.map((weight) => weight.toFixed(8)).join(','), point]));
  const sorted = [...unique.values()].sort((a, b) => a.annualizedVolatility - b.annualizedVolatility || b.annualizedReturn - a.annualizedReturn);
  const points: EfficientFrontierPoint[] = [];
  let bestReturn = -Infinity;
  for (const point of sorted) {
    if (point.annualizedReturn > bestReturn + 1e-10) {
      points.push(point);
      bestReturn = point.annualizedReturn;
    }
  }
  const maximumHistoricalSharpe = [...points, ...sorted].reduce((best, point) =>
    point.historicalSharpe !== null && (best === null || point.historicalSharpe > best.historicalSharpe!) ? point : best,
  null as EfficientFrontierPoint | null);
  if (!maximumHistoricalSharpe || !points.length || points.some((point) => point.weights.some((weight) => !Number.isFinite(weight) || weight < 0) || Math.abs(point.weights.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-8)) return null;
  return { symbols, observations, points, current: currentPoint, minimumVariance: minPoint, maximumHistoricalSharpe, iterations, regularization: stable.epsilon };
}
