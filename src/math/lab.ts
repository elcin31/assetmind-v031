/** Historical risk of today's fixed holdings; not a backtest of actual account NAV. */
export function historicalRisk(values: number[], returns: number[]) {
  if (values.length < 21 || returns.length !== values.length - 1 || values.some(v => !Number.isFinite(v) || v <= 0) || returns.some(r => !Number.isFinite(r))) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const count = Math.max(1, Math.ceil(sorted.length * 0.05));
  const tail = sorted.slice(0, count);
  let peak = values[0]; let maxDrawdown = 0;
  for (const value of values) { peak = Math.max(peak, value); maxDrawdown = Math.max(maxDrawdown, 1 - value / peak); }
  return {
    observations: returns.length,
    var95: Math.max(0, -sorted[count - 1]),
    es95: Math.max(0, -tail.reduce((a, b) => a + b, 0) / count),
    maxDrawdown,
    meanDaily: returns.reduce((a, b) => a + b, 0) / returns.length,
  };
}
export function concentration(weights: number[]) {
  if (!weights.length || weights.some(w => !Number.isFinite(w) || w < 0)) return null;
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  const hhi = weights.reduce((a, b) => a + (b / sum) ** 2, 0);
  return { hhi, effectivePositions: 1 / hhi };
}
export function stressValue(values: { symbol: string; value: number }[], shock: number, symbol: string) {
  const current = values.reduce((s, p) => s + p.value, 0);
  const change = values.reduce((s, p) => s + (symbol === '*' || symbol === p.symbol ? p.value * shock : 0), 0);
  return { current, change, after: current + change };
}
