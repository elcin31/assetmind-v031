import { EPSILON, finite, valid } from './statistics';
/** Annualized matrix in decimal-return units, fully aligned observations required. */
export function portfolioVariance(weights: number[], matrix: number[][]): number | null {
  const n = weights.length;
  if (!valid(weights) || weights.some(w => w < 0) || Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > 1e-8 || matrix.length !== n || matrix.some(row => row.length !== n || !valid(row))) return null;
  if (matrix.some((row, i) => row[i] < 0 || row.some((v, j) => Math.abs(v - matrix[j][i]) > 1e-10 || Math.abs(v) > Math.sqrt(row[i] * matrix[j][j]) + 1e-10))) return null;
  const value = finite(weights.reduce((sum, w, i) => sum + w * matrix[i].reduce((s, cov, j) => s + cov * weights[j], 0), 0));
  return value === null || value < -EPSILON ? null : Math.max(0, value);
}
