import { downsideDeviation } from "./downside";
import {
  finite,
  mean,
  MIN_OBSERVATIONS,
  safeRatio,
  valid,
  volatility,
} from "./statistics";
export function sharpeRatio(returns: number[], rf = 0): number | null {
  const average = mean(returns);
  return average === null || !Number.isFinite(rf) || returns.some((r) => r < -1)
    ? null
    : safeRatio(average * 252 - rf, volatility(returns));
}
export function sortinoRatio(returns: number[], annualMar = 0): number | null {
  const average = mean(returns);
  return average === null
    ? null
    : safeRatio(
        average * 252 - annualMar,
        downsideDeviation(returns, annualMar / 252),
      );
}
export function calmarRatio(
  growth: number | null,
  maxDrawdown: number | null,
): number | null {
  return maxDrawdown === null || maxDrawdown >= 0
    ? null
    : safeRatio(growth, Math.abs(maxDrawdown));
}
export function historicalTailRisk(returns: number[], confidence = 0.95) {
  if (
    !valid(returns, MIN_OBSERVATIONS) ||
    returns.some((r) => r < -1) ||
    !Number.isFinite(confidence) ||
    confidence <= 0 ||
    confidence >= 1
  )
    return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil((1 - confidence - 1e-12) * returns.length));
  const average = mean(sorted.slice(0, k));
  return average === null
    ? null
    : {
        var: finite(Math.max(0, -sorted[k - 1])),
        es: finite(Math.max(0, -average)),
      };
}
