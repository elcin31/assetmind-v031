import { annualToDaily } from "./statistics";

/**
 * Sharpe Ratio.
 *
 * Sharpe = (portfolioReturn - riskFreeRate) / volatility
 *
 * For MVP:
 * - riskFreeRate is an explicit parameter (default caller may pass 0).
 * - portfolioReturn is the annualized mean of daily returns.
 * - volatility is the annualized volatility.
 *
 * Never returns NaN / Infinity. Returns null when calculation is impossible.
 */

export function calculateSharpe(
  dailyReturns: number[],
  annualizedVol: number | null,
  riskFreeRate: number = 0
): number | null {
  if (annualizedVol === null || !Number.isFinite(annualizedVol)) {
    return null;
  }

  // Zero (or near-zero) volatility → undefined / unavailable
  if (Math.abs(annualizedVol) < 1e-12) {
    return null;
  }

  if (!dailyReturns || dailyReturns.length < 2) {
    return null;
  }

  const meanDaily =
    dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;

  if (!Number.isFinite(meanDaily)) {
    return null;
  }

  // Annualize mean return (simple ×252)
  const annualizedReturn = meanDaily * 252;

  if (!Number.isFinite(annualizedReturn)) {
    return null;
  }

  const dailyRf = annualToDaily(riskFreeRate);
  if (dailyRf === null) return null;
  const excess = annualizedReturn - dailyRf * 252;
  const sharpe = excess / annualizedVol;

  if (!Number.isFinite(sharpe)) {
    return null;
  }

  return Math.round(sharpe * 1e4) / 1e4;
}
