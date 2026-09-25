import { finite } from "./statistics";
export type ScenarioPreset = "broad" | "broad20" | "tech" | "volatility" | "customEqual" | "custom";
/** Membership is user selected; no undocumented sector or volatility inference. */
export function scenarioPreset(
  symbols: string[],
  preset: ScenarioPreset,
  selected: string[],
): Record<string, number> {
  return Object.fromEntries(
    symbols.map((s) => [
      s,
      preset === "broad"
        ? -0.1
        : preset === "broad20"
          ? -0.2
        : preset === "tech"
          ? selected.includes(s)
            ? -0.25
            : -0.08
            : preset === "volatility"
              ? selected.includes(s)
                ? -0.35
                : -0.12
              : preset === "customEqual"
                ? selected.length ? selected.includes(s) ? -0.1 : 0 : -0.1
              : 0,
    ]),
  );
}
export interface AssetStressImpact {
  symbol: string;
  weight: number;
  shockPct: number;
  impactValue: number;
  portfolioImpactPct: number | null;
}

export interface StressResult {
  current: number;
  after: number;
  impact: number;
  percentage: number | null;
  assetImpacts: AssetStressImpact[];
}

export function scenarioValue(
  positions: { symbol: string; value: number }[],
  shocks: Record<string, number>,
): StressResult | null {
  if (
    !positions.length ||
    positions.some(
      (p) =>
        !Number.isFinite(p.value) ||
        p.value < 0 ||
        !Number.isFinite(shocks[p.symbol]) ||
        shocks[p.symbol] < -1 ||
        !p.symbol,
    )
  )
    return null;
  const current = finite(positions.reduce((s, p) => s + p.value, 0));
  const after = finite(
    positions.reduce((s, p) => s + p.value * (1 + shocks[p.symbol]), 0),
  );
  if (current === null || current <= 1e-12 || after === null) return null;
  const impact = finite(after - current);
  if (impact === null) return null;
  const assetImpacts = positions.map((position) => {
    const shockPct = shocks[position.symbol];
    const impactValue = finite(position.value * shockPct);
    const weight = finite(position.value / current);
    const portfolioImpactPct = finite(weight === null ? Number.NaN : weight * shockPct);
    if (impactValue === null || weight === null || portfolioImpactPct === null) return null;
    return { symbol: position.symbol, weight, shockPct, impactValue, portfolioImpactPct };
  });
  if (assetImpacts.some((item) => item === null)) return null;
  return {
    current,
    after,
    impact,
    percentage: finite(after / current - 1),
    assetImpacts: assetImpacts as AssetStressImpact[],
  };
}
