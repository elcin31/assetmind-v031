import { finite } from "./statistics";
export type ScenarioPreset = "broad" | "tech" | "volatility" | "custom";
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
        ? -0.15
        : preset === "tech"
          ? selected.includes(s)
            ? -0.25
            : -0.08
          : preset === "volatility"
            ? selected.includes(s)
              ? -0.35
              : -0.12
            : 0,
    ]),
  );
}
export function scenarioValue(
  positions: { symbol: string; value: number }[],
  shocks: Record<string, number>,
) {
  if (
    !positions.length ||
    positions.some(
      (p) =>
        !Number.isFinite(p.value) ||
        p.value < 0 ||
        !Number.isFinite(shocks[p.symbol]) ||
        shocks[p.symbol] < -1,
    )
  )
    return null;
  const current = finite(positions.reduce((s, p) => s + p.value, 0));
  const after = finite(
    positions.reduce((s, p) => s + p.value * (1 + shocks[p.symbol]), 0),
  );
  if (current === null || current <= 1e-12 || after === null) return null;
  return {
    current,
    after,
    impact: finite(after - current),
    percentage: finite(after / current - 1),
  };
}
