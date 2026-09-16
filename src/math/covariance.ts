import { EPSILON, finite, valid } from "./statistics";
/** Annualized matrix in decimal-return units, fully aligned observations required. */
export function portfolioVariance(
  weights: number[],
  matrix: number[][],
): number | null {
  const n = weights.length;
  if (
    !valid(weights) ||
    weights.some((w) => w < 0) ||
    Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > 1e-8 ||
    matrix.length !== n ||
    matrix.some((row) => row.length !== n || !valid(row))
  )
    return null;
  if (
    matrix.some(
      (row, i) =>
        row[i] < 0 ||
        row.some(
          (v, j) =>
            Math.abs(v - matrix[j][i]) > 1e-10 ||
            Math.abs(v) > Math.sqrt(row[i] * matrix[j][j]) + 1e-10,
        ),
    )
  )
    return null;
  // LDL decomposition also rejects indefinite matrices whose pairwise bounds happen to pass.
  const lower = Array.from({ length: n }, () => Array<number>(n).fill(0));
  const diagonal = Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    lower[i][i] = 1;
    for (let j = 0; j < i; j++) {
      let residual = matrix[i][j];
      for (let k = 0; k < j; k++)
        residual -= lower[i][k] * lower[j][k] * diagonal[k];
      if (Math.abs(diagonal[j]) <= EPSILON) {
        if (Math.abs(residual) > EPSILON) return null;
      } else lower[i][j] = residual / diagonal[j];
    }
    let pivot = matrix[i][i];
    for (let k = 0; k < i; k++) pivot -= lower[i][k] ** 2 * diagonal[k];
    if (!Number.isFinite(pivot) || pivot < -EPSILON) return null;
    diagonal[i] = Math.max(0, pivot);
  }
  const value = finite(
    weights.reduce(
      (sum, w, i) =>
        sum + w * matrix[i].reduce((s, cov, j) => s + cov * weights[j], 0),
      0,
    ),
  );
  return value === null || value < -EPSILON ? null : Math.max(0, value);
}
