import type { HistoryBar } from "../types";
import type { CorrelationMatrix } from "../types/analytics";
import { datedReturns } from "./performance";
import { covariance, EPSILON, MIN_OBSERVATIONS, safeRatio } from "./statistics";
export function correlation(a: number[], b: number[]): number | null {
  const cov = covariance(a, b);
  const va = covariance(a, a);
  const vb = covariance(b, b);
  const value = safeRatio(
    cov,
    va === null || vb === null || va <= EPSILON || vb <= EPSILON
      ? null
      : Math.sqrt(va) * Math.sqrt(vb),
  );
  return value === null ? null : Math.max(-1, Math.min(1, value));
}
/** Align return intervals by BOTH endpoints before covariance, never bridge a missing price. */
export function correlationMatrix(
  symbols: string[],
  histories: Map<string, HistoryBar[]>,
): CorrelationMatrix | null {
  if (!symbols.length || new Set(symbols).size !== symbols.length) return null;
  const series = symbols.map((s) => datedReturns(histories.get(s) ?? []));
  const maps = series.map(
    (rs) => new Map(rs.map((r) => [`${r.startDate}/${r.date}`, r])),
  );
  const keys = [...maps[0].keys()].filter((k) => maps.every((m) => m.has(k)));
  if (keys.length < MIN_OBSERVATIONS) return null;
  const returns = maps.map((m) => keys.map((k) => m.get(k)!));
  const values = returns.map((rs) => rs.map((r) => r.value));
  const cov = values.map((a) => values.map((b) => covariance(a, b)));
  const corr = values.map((a) => values.map((b) => correlation(a, b)));
  if (
    cov.some((row) => row.some((v) => v === null || !Number.isFinite(v * 252))) ||
    corr.some((row) => row.some((v) => v === null))
  )
    return null;
  return {
    symbols,
    returns,
    covariance: (cov as number[][]).map((row) => row.map((v) => v * 252)),
    correlation: corr as number[][],
    observations: keys.length,
  };
}
export function averageCorrelation(matrix: number[][]): number | null {
  if (
    matrix.length < 2 ||
    matrix.some(
      (row) =>
        row.length !== matrix.length ||
        row.some((v) => !Number.isFinite(v) || Math.abs(v) > 1),
    )
  )
    return null;
  const pairs = matrix.flatMap((row, i) => row.slice(i + 1));
  return pairs.reduce((a, b) => a + b / pairs.length, 0);
}
