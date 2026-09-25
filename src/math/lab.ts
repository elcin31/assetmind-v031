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
  if (!Number.isFinite(sum) || sum <= 0) return null;
  const hhi = weights.reduce((a, b) => a + (b / sum) ** 2, 0);
  const effectivePositions = hhi > 0 ? 1 / hhi : null;
  return Number.isFinite(hhi) && effectivePositions !== null && Number.isFinite(effectivePositions)
    ? { hhi, effectivePositions }
    : null;
}

export function concentrationSummary(positions: { symbol: string; weight: number; marketValue: number }[]) {
  if (!positions.length || positions.some(p => !p.symbol || !Number.isFinite(p.weight) || p.weight < 0 || !Number.isFinite(p.marketValue) || p.marketValue < 0)) return null;
  const totalWeight = positions.reduce((sum, p) => sum + p.weight, 0);
  if (!Number.isFinite(totalWeight) || Math.abs(totalWeight - 1) > 1e-8) return null;
  const sorted = [...positions].sort((a, b) => b.weight - a.weight);
  const result = concentration(sorted.map(p => p.weight));
  if (!result) return null;
  return {
    positions: sorted,
    largestPositionWeight: sorted[0]?.weight ?? null,
    top3Weight: sorted.slice(0, 3).reduce((sum, p) => sum + p.weight, 0),
    top5Weight: sorted.slice(0, 5).reduce((sum, p) => sum + p.weight, 0),
    ...result,
  };
}
export function stressValue(values: { symbol: string; value: number }[], shock: number, symbol: string) {
  const current = values.reduce((s, p) => s + p.value, 0);
  const change = values.reduce((s, p) => s + (symbol === '*' || symbol === p.symbol ? p.value * shock : 0), 0);
  return { current, change, after: current + change };
}
