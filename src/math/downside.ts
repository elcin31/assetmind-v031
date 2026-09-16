import { finite, MIN_OBSERVATIONS, valid } from "./statistics";
/** MAR is a daily arithmetic target. Convert annual effective MAR with annualToDaily at the boundary. */
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
  return finite(
    Math.sqrt(
      returns.reduce(
        (sum, r) => sum + Math.min(r - dailyMar, 0) ** 2 / returns.length,
        0,
      ),
    ) * Math.sqrt(252),
  );
}
