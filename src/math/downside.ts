import {
  finite,
  MIN_DOWNSIDE_OBSERVATIONS,
  MIN_OBSERVATIONS,
  valid,
} from './statistics';

/**
 * Annualized downside deviation relative to a DAILY MAR.
 * Only observations below MAR enter the RMS denominator. At least 20 total
 * returns and 5 downside observations are required.
 */
export function downsideDeviation(
  returns: number[],
  dailyMar = 0,
): number | null {
  if (
    !valid(returns, MIN_OBSERVATIONS) ||
    returns.some((r) => r < -1) ||
    !Number.isFinite(dailyMar)
  )
    return null;
  const downside = returns.filter((r) => r < dailyMar);
  if (downside.length < MIN_DOWNSIDE_OBSERVATIONS) return null;
  return finite(
    Math.sqrt(
      downside.reduce(
        (sum, r) => sum + (r - dailyMar) ** 2 / downside.length,
        0,
      ),
    ) * Math.sqrt(252),
  );
}
