/**
 * Annualized portfolio volatility.
 *
 * Methodology:
 * - Compute sample standard deviation of daily returns.
 * - Annualize with √252 (trading days assumption).
 *
 * Handles:
 * - empty / insufficient data → null
 * - zero volatility → 0
 * - never returns NaN or Infinity
 */

export function annualizedVolatility(dailyReturns: number[]): number | null {
  if (!dailyReturns || dailyReturns.length < 2) {
    return null;
  }

  const n = dailyReturns.length;
  const mean = dailyReturns.reduce((s, r) => s + r, 0) / n;

  let sumSq = 0;
  for (const r of dailyReturns) {
    const d = r - mean;
    sumSq += d * d;
  }

  // Sample std (n-1)
  const variance = sumSq / (n - 1);
  if (!Number.isFinite(variance) || variance < 0) {
    return null;
  }

  const dailyVol = Math.sqrt(variance);
  if (!Number.isFinite(dailyVol)) {
    return null;
  }

  const annualized = dailyVol * Math.sqrt(252);

  if (!Number.isFinite(annualized)) {
    return null;
  }

  // Clamp tiny values to 0 for UI cleanliness
  if (Math.abs(annualized) < 1e-12) {
    return 0;
  }

  return Math.round(annualized * 1e6) / 1e6;
}
