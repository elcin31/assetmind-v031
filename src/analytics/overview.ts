import type { PortfolioSnapshot } from "../types";
import type { PortfolioAnalytics } from "../math/analytics";
import { buildRebalancePlan } from "../math/rebalancing";
import { pct } from "../utils/analyticsFormat";

export const isFiniteValue = (
  value: number | null | undefined,
): value is number => value != null && Number.isFinite(value);

/** Presentation-only readouts; never reconstruct returns or fill missing prices. */
export function overviewReadouts(
  snapshot: PortfolioSnapshot,
  a: PortfolioAnalytics,
) {
  const first = a.points[0];
  const last = a.points.at(-1);
  const comparison = a.benchmark.comparison;
  // The benchmark engine can return a clean fragment. Overview promises the
  // selected period, so require both endpoints and complete factual performance.
  const comparable =
    isFiniteValue(a.performance.totalReturn) &&
    comparison.length > 1 &&
    comparison[0].date === first?.date &&
    comparison.at(-1)?.date === last?.date;
  const excessReturn =
    comparable &&
    isFiniteValue(a.benchmark.portfolioReturn) &&
    isFiniteValue(a.benchmark.benchmarkReturn)
      ? a.benchmark.portfolioReturn - a.benchmark.benchmarkReturn
      : null;
  const value = snapshot.valuation.complete
    ? isFiniteValue(snapshot.accountValue)
      ? snapshot.accountValue
      : snapshot.portfolioValue
    : null;
  const valueChange =
    first &&
    last &&
    a.points.length > 1 &&
    isFiniteValue(first.value) &&
    isFiniteValue(last.value)
      ? last.value - first.value
      : null;
  return {
    value,
    valueChange,
    excessReturn,
    comparison: comparable ? comparison : [],
  };
}

export interface OverviewInsight {
  id: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  explanation: string;
  metric: string;
}

/** Explicit deterministic thresholds, ranked by severity then rule order. */
export function overviewInsights(
  snapshot: PortfolioSnapshot,
  a: PortfolioAnalytics,
  loading: boolean,
  errors: string[],
): OverviewInsight[] {
  const signals: OverviewInsight[] = [];
  const missing = snapshot.valuation.unpricedSymbols;
  const historyIncomplete =
    !loading &&
    (errors.length > 0 ||
      a.history.missingSymbols.length > 0 ||
      a.history.missingDates.length > 0);
  if (!snapshot.valuation.complete || historyIncomplete) {
    signals.push({
      id: "market-data",
      severity: !snapshot.valuation.complete ? "HIGH" : "MEDIUM",
      title: "Неполные рыночные данные",
      explanation: !snapshot.valuation.complete
        ? `Нет котировок: ${missing.join(", ") || "часть позиций"}.`
        : "Часть истории недоступна — некоторые показатели не рассчитаны.",
      metric: !snapshot.valuation.complete
        ? `${snapshot.valuation.pricedPositions}/${snapshot.valuation.totalPositions} оценено`
        : "История неполная",
    });
  }
  if (snapshot.valuation.complete && snapshot.portfolioValue > 0) {
    const largest = [...snapshot.allocation]
      .filter((p) => isFiniteValue(p.weight))
      .sort((x, y) => y.weight - x.weight)[0];
    if (largest && largest.weight >= 0.25)
      signals.push({
        id: "concentration",
        severity: largest.weight >= 0.4 ? "HIGH" : "MEDIUM",
        title: "Высокая концентрация",
        explanation: `${largest.symbol} занимает ${pct(largest.weight)} стоимости активов.`,
        metric: pct(largest.weight),
      });
    const risk = !loading
      ? a.currentRisk?.contributions
          .filter((p) => isFiniteValue(p.fraction) && isFiniteValue(p.weight))
          .slice()
          .sort((x, y) => y.fraction - x.fraction)[0]
      : undefined;
    if (risk && risk.fraction >= 0.4)
      signals.push({
        id: "risk",
        severity: risk.fraction >= 0.6 ? "HIGH" : "MEDIUM",
        title: "Концентрация риска",
        explanation: `${risk.symbol}: ${pct(risk.fraction)} дисперсии модели текущего состава при весе ${pct(risk.weight)}.`,
        metric: pct(risk.fraction),
      });
  }
  if (
    snapshot.targetAllocation?.length &&
    snapshot.cashLedger?.complete &&
    snapshot.valuation.complete
  ) {
    const plan = buildRebalancePlan(
      snapshot.positions,
      snapshot.cashLedger.balance,
      snapshot.targetAllocation,
      true,
      true,
    );
    if (plan.available && isFiniteValue(plan.drift) && plan.drift >= 0.05)
      signals.push({
        id: "drift",
        severity: plan.drift >= 0.1 ? "HIGH" : "MEDIUM",
        title: "Отклонение от цели",
        explanation: `Структура счёта отклонилась от целевых весов на ${pct(plan.drift)}.`,
        metric: pct(plan.drift),
      });
  }
  const dd = !loading ? a.drawdown?.current : null;
  if (isFiniteValue(dd) && dd <= -0.05)
    signals.push({
      id: "drawdown",
      severity: dd <= -0.2 ? "HIGH" : dd <= -0.1 ? "MEDIUM" : "LOW",
      title: "Просадка портфеля",
      explanation: `Доходность ниже пика выбранного периода на ${pct(Math.abs(dd))}.`,
      metric: pct(dd),
    });
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return signals
    .sort((x, y) => rank[x.severity] - rank[y.severity])
    .slice(0, 3);
}

export function topPnlRows(a: PortfolioAnalytics, detractors: boolean) {
  return a.pnl
    .filter(
      (p) =>
        isFiniteValue(p.totalPnL) &&
        (detractors ? p.totalPnL < 0 : p.totalPnL > 0),
    )
    .sort((x, y) =>
      detractors ? x.totalPnL! - y.totalPnL! : y.totalPnL! - x.totalPnL!,
    )
    .slice(0, 3);
}
