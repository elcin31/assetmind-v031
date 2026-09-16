import { downsideDeviation } from './downside';
import {
  annualRateToDaily,
  finite,
  mean,
  MIN_OBSERVATIONS,
  safeRatio,
  valid,
  volatility,
} from './statistics';

export function sharpeRatio(returns: number[], annualRf = 0): number | null {
  if (returns.some((r) => r < -1)) return null;
  const dailyRf = annualRateToDaily(annualRf);
  if (dailyRf === null) return null;
  const averageExcess = mean(returns.map((r) => r - dailyRf));
  return averageExcess === null
    ? null
    : safeRatio(averageExcess * 252, volatility(returns));
}

export function sortinoRatio(returns: number[], annualMar = 0): number | null {
  if (returns.some((r) => r < -1)) return null;
  const dailyMar = annualRateToDaily(annualMar);
  if (dailyMar === null) return null;
  const averageExcess = mean(returns.map((r) => r - dailyMar));
  return averageExcess === null
    ? null
    : safeRatio(
        averageExcess * 252,
        downsideDeviation(returns, dailyMar),
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
