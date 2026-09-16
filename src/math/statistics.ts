export const EPSILON = 1e-12;
export const MIN_OBSERVATIONS = 20;
export const TRADING_DAYS = 252;
export const finite = (value: number): number | null =>
  Number.isFinite(value) ? value : null;
export function valid(values: number[], minimum = 1): boolean {
  return values.length >= minimum && values.every(Number.isFinite);
}
export function mean(values: number[]): number | null {
  return valid(values)
    ? finite(values.reduce((a, b) => a + b / values.length, 0))
    : null;
}
export function covariance(
  a: number[],
  b: number[],
  minimum = MIN_OBSERVATIONS,
): number | null {
  if (a.length !== b.length || !valid(a, Math.max(2, minimum)) || !valid(b))
    return null;
  const ma = mean(a);
  const mb = mean(b);
  if (ma === null || mb === null) return null;
  return finite(
    a.reduce((sum, v, i) => sum + ((v - ma) * (b[i] - mb)) / (a.length - 1), 0),
  );
}
export function volatility(
  values: number[],
  minimum = MIN_OBSERVATIONS,
): number | null {
  const variance = covariance(values, values, minimum);
  return variance === null || variance < 0
    ? null
    : finite(Math.sqrt(variance * TRADING_DAYS));
}
export function safeRatio(a: number | null, b: number | null): number | null {
  return a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b) <= EPSILON
    ? null
    : finite(a / b);
}
export function validDate(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}

/** Annual effective rate; 252 trading-day equivalent, shared by RF and MAR. */
export function annualToDaily(rate: number): number | null {
  return Number.isFinite(rate) && rate > -1 ? finite(Math.expm1(Math.log1p(rate) / TRADING_DAYS)) : null;
}
