import type { PortfolioSnapshot, Position, TargetAllocation } from "../types";
import {
  buildRebalancePlan,
  normalizeTargetAllocation,
  simulateTradeWhatIf,
  targetCashWeight,
  type WhatIfInput,
} from "./rebalancing";
import type { PortfolioAnalytics } from "./analytics";
import type { DatedReturn } from "../types/analytics";
import { riskContributions } from "./riskContribution";
import { benchmarkMetrics } from "./benchmark";
import { historicalTailRisk } from "./ratios";
import { HISTORICAL_TAIL_MIN_OBSERVATIONS } from "./riskHorizon";
import { minimumVariancePortfolio } from "./portfolioOptimization";

const EPS = 1e-8;
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export interface PlanningConstraints {
  minimumTradeValue: number;
  maxPositionWeight: number;
  minimumCashWeight: number;
  buyOnly: boolean;
  noSell: boolean;
}
export const DEFAULT_CONSTRAINTS: PlanningConstraints = {
  minimumTradeValue: 0,
  maxPositionWeight: 1,
  minimumCashWeight: 0,
  buyOnly: false,
  noSell: false,
};
export function constraintReason(c: PlanningConstraints): string | null {
  if (
    !finite(c.minimumTradeValue) ||
    c.minimumTradeValue < 0 ||
    !finite(c.maxPositionWeight) ||
    c.maxPositionWeight <= 0 ||
    c.maxPositionWeight > 1 ||
    !finite(c.minimumCashWeight) ||
    c.minimumCashWeight < 0 ||
    c.minimumCashWeight > 1
  )
    return "Проверьте ограничения: сумма ≥ 0, max weight > 0 и ≤ 100%, cash от 0 до 100%.";
  return null;
}
export function valuationReason(s: PortfolioSnapshot) {
  if (
    !s.cashLedger?.complete ||
    !finite(s.cashLedger.balance) ||
    s.cashLedger.balance < 0
  )
    return "Нужен полный reconciled cash ledger.";
  if (
    !s.valuation.complete ||
    s.positions.some(
      (p) =>
        !finite(p.marketValue) ||
        p.marketValue < 0 ||
        !finite(p.marketPrice) ||
        p.marketPrice <= 0 ||
        !finite(p.quantity) ||
        p.quantity < 0,
    )
  )
    return "Нужны рыночные котировки всех открытых позиций.";
  return null;
}
const totalValue = (positions: Position[], cash: number) =>
  positions.reduce((sum, p) => sum + p.marketValue!, cash);
export function targetRows(s: PortfolioSnapshot, targets: TargetAllocation[]) {
  const reason = valuationReason(s);
  const plan = buildRebalancePlan(
    s.positions,
    s.cashLedger?.balance ?? 0,
    targets,
    !reason,
    !reason,
  );
  const total = !reason ? totalValue(s.positions, s.cashLedger!.balance) : null;
  const symbols = [
    ...new Set([
      ...s.positions.map((p) => p.symbol),
      ...targets.map((t) => t.symbol),
    ]),
  ];
  const rows = symbols.map((symbol) => ({
    symbol,
    current:
      total && total > 0
        ? (s.positions.find((p) => p.symbol === symbol)?.marketValue ?? 0) /
          total
        : null,
    target: targets.find((t) => t.symbol === symbol)?.weight ?? 0,
  }));
  rows.push({
    symbol: "CASH",
    current: total && total > 0 ? s.cashLedger!.balance / total : null,
    target: targetCashWeight(targets),
  });
  return {
    reason: reason ?? plan.reason,
    rows: rows.map((r) => ({
      ...r,
      difference: r.current === null ? null : r.current - r.target,
      status:
        r.current === null
          ? null
          : Math.abs(r.current - r.target) <= 0.001
            ? "Balanced"
            : r.current > r.target
              ? "Overweight"
              : "Underweight",
    })),
  };
}
export function initialTargetDraft(
  s: PortfolioSnapshot,
): Record<string, string> {
  const targets = s.targetAllocation ?? [];
  // Current account weights include cash; never default securities weights to 100% when cash exists.
  const rows = targetRows(s, targets).rows.filter((r) => r.symbol !== "CASH");
  return Object.fromEntries(
    rows.map((r) => [
      r.symbol,
      String(
        Math.round((targets.length ? r.target : (r.current ?? 0)) * 10000) /
          100,
      ),
    ]),
  );
}
export function parseTargetDraft(draft: Record<string, string>) {
  try {
    const rows = Object.entries(draft).map(([symbol, value]) => ({
      symbol,
      weight: value.trim() === "" ? 0 : Number(value) / 100,
    }));
    if (rows.some((r) => r.symbol === "CASH"))
      throw Error("CASH — остаток до 100%, измените цели активов.");
    const targets = normalizeTargetAllocation(rows);
    return { targets, cash: targetCashWeight(targets), reason: null };
  } catch (e) {
    return {
      targets: [] as TargetAllocation[],
      cash: null,
      reason: e instanceof Error ? e.message : "Некорректные цели.",
    };
  }
}
export interface ProposalRow {
  symbol: string;
  currentWeight: number;
  targetWeight: number;
  deltaWeight: number;
  delta: number;
  action: "BUY" | "SELL";
  quantity: number;
  afterWeight: number;
}
export interface Proposal {
  available: boolean;
  reason: string | null;
  rows: ProposalRow[];
  drift: number | null;
  afterDrift: number | null;
  turnover: number | null;
  tradeCount: number;
  cashAfter: number | null;
  unallocated: number | null;
  notes: string[];
}
const invalidProposal = (reason: string): Proposal => ({
  available: false,
  reason,
  rows: [],
  drift: null,
  afterDrift: null,
  turnover: null,
  tradeCount: 0,
  cashAfter: null,
  unallocated: null,
  notes: [],
});

/** Deterministic deficit-proportional allocation. Remove sub-minimum orders then redistribute. */
function allocateBuys(
  needs: { symbol: string; value: number }[],
  budget: number,
  minimum: number,
) {
  let candidates = needs.filter(
    (n) => n.value > EPS && n.value + EPS >= minimum,
  );
  while (candidates.length) {
    const sum = candidates.reduce((v, n) => v + n.value, 0);
    const factor = Math.min(1, Math.max(0, budget) / sum);
    const valid = candidates.filter(
      (n) => n.value * factor + EPS >= minimum && n.value * factor > EPS,
    );
    if (valid.length === candidates.length)
      return candidates.map((n) => ({ ...n, value: n.value * factor }));
    // If all proportional shares are too small, fund the largest deficit first.
    candidates = valid.length
      ? valid
      : candidates
          .slice()
          .sort((a, b) => b.value - a.value || a.symbol.localeCompare(b.symbol))
          .slice(0, -1);
  }
  return [];
}

export function buildConstrainedProposal(
  s: PortfolioSnapshot,
  c: PlanningConstraints,
  newCapital?: number,
): Proposal {
  const invalid = constraintReason(c) ?? valuationReason(s);
  if (invalid) return invalidProposal(invalid);
  if (newCapital !== undefined && (!finite(newCapital) || newCapital <= 0))
    return invalidProposal(
      "Новый капитал должен быть положительной конечной суммой.",
    );
  const targets = s.targetAllocation ?? [];
  const cash = s.cashLedger!.balance + (newCapital ?? 0);
  const total = totalValue(s.positions, cash);
  if (!finite(total) || total <= 0)
    return invalidProposal("Стоимость счёта должна быть положительной.");
  const plan = buildRebalancePlan(s.positions, cash, targets, true, true);
  if (!plan.available) return invalidProposal(plan.reason!);
  const notes: string[] = [];
  const rows: ProposalRow[] = [];
  const prices = new Map(s.positions.map((p) => [p.symbol, p.marketPrice!]));
  const sellsAllowed = newCapital === undefined && !c.buyOnly && !c.noSell;
  let workingCash = cash;
  for (const r of plan.rows) {
    const target = Math.min(r.targetWeight, c.maxPositionWeight);
    const delta = target * total - r.currentValue;
    if (delta >= -EPS || !sellsAllowed) continue;
    if (!prices.has(r.symbol)) {
      notes.push(`${r.symbol}: нет котировки, предложение пропущено.`);
      continue;
    }
    if (
      Math.abs(delta) + EPS < c.minimumTradeValue ||
      (r.action === "HOLD" && r.currentWeight <= c.maxPositionWeight + EPS)
    )
      continue;
    rows.push({
      symbol: r.symbol,
      currentWeight: r.currentWeight,
      targetWeight: r.targetWeight,
      deltaWeight: delta / total,
      delta,
      action: "SELL",
      quantity: Math.abs(delta) / prices.get(r.symbol)!,
      afterWeight: target,
    });
    workingCash -= delta;
  }
  const reserve = Math.max(c.minimumCashWeight, plan.targetCashWeight) * total;
  // Raise an explicit minimum cash reserve even when saved targets prefer less cash.
  if (sellsAllowed && workingCash + EPS < reserve) {
    const candidates = [...s.positions].sort((a,b) => b.marketValue! - a.marketValue! || a.symbol.localeCompare(b.symbol));
    for (const p of candidates) {
      if (workingCash + EPS >= reserve) break;
      const existing = rows.find(r => r.symbol === p.symbol);
      const remaining = p.marketValue! + (existing?.delta ?? 0);
      const amount = Math.min(remaining, Math.max(reserve-workingCash, existing ? 0 : c.minimumTradeValue));
      if (amount <= EPS || (!existing && amount + EPS < c.minimumTradeValue)) continue;
      if (existing) {
        existing.delta -= amount;
        existing.deltaWeight = existing.delta / total;
        existing.quantity = Math.abs(existing.delta) / prices.get(p.symbol)!;
        existing.afterWeight = (p.marketValue! + existing.delta) / total;
      } else {
        rows.push({symbol:p.symbol,currentWeight:p.marketValue!/total,targetWeight:targets.find(t=>t.symbol===p.symbol)?.weight ?? 0,deltaWeight:-amount/total,delta:-amount,action:'SELL',quantity:amount/prices.get(p.symbol)!,afterWeight:(p.marketValue!-amount)/total});
      }
      workingCash += amount;
    }
  }
  const budget = Math.min(
    Math.max(0, workingCash - reserve),
    newCapital ?? Infinity,
  );
  const needs = plan.rows.flatMap((r) => {
    const desired =
      Math.min(r.targetWeight, c.maxPositionWeight) * total - r.currentValue;
    if (desired <= EPS || rows.some(row => row.symbol === r.symbol)) return [];
    if (!prices.has(r.symbol)) {
      notes.push(
        `${r.symbol}: нет рыночной котировки; капитал остаётся в CASH.`,
      );
      return [];
    }
    return r.action === "HOLD" ? [] : [{ symbol: r.symbol, value: desired }];
  });
  for (const buy of allocateBuys(needs, budget, c.minimumTradeValue)) {
    const r = plan.rows.find((r) => r.symbol === buy.symbol)!;
    rows.push({
      symbol: buy.symbol,
      currentWeight: r.currentWeight,
      targetWeight: r.targetWeight,
      deltaWeight: buy.value / total,
      delta: buy.value,
      action: "BUY",
      quantity: buy.value / prices.get(buy.symbol)!,
      afterWeight: (r.currentValue + buy.value) / total,
    });
    workingCash -= buy.value;
  }
  const after = s.positions.map((p) => ({
    ...p,
    marketValue:
      p.marketValue! + (rows.find((r) => r.symbol === p.symbol)?.delta ?? 0),
  }));
  const afterPlan = buildRebalancePlan(after, workingCash, targets, true, true);
  const over = after.filter(
    (p) => p.marketValue! / total > c.maxPositionWeight + EPS,
  );
  if (over.length)
    notes.push(
      `Max weight не достигнут: ${over.map((p) => p.symbol).join(", ")}. Ограничения или minimum trade не позволяют исправить состав.`,
    );
  if (workingCash / total + EPS < c.minimumCashWeight)
    notes.push(
      "Minimum CASH не достигнут; для этого нужны дополнительные продажи или капитал.",
    );
  if (targets.some((t) => t.weight > c.maxPositionWeight))
    notes.push(
      "Некоторые target weights выше max position weight; покупки ограничены лимитом.",
    );
  return {
    available: true,
    reason: null,
    rows,
    drift: plan.drift,
    afterDrift: afterPlan.drift,
    turnover: rows.reduce((sum, r) => sum + Math.abs(r.delta), 0) / total,
    tradeCount: rows.length,
    cashAfter: workingCash,
    unallocated:
      newCapital === undefined
        ? null
        : newCapital -
          rows
            .filter((r) => r.action === "BUY")
            .reduce((sum, r) => sum + r.delta, 0),
    notes,
  };
}

export interface ModelMetric {
  value: number | null;
  reason: string | null;
}
const metric = (
  value: number | null | undefined,
  reason: string,
): ModelMetric =>
  finite(value) ? { value, reason: null } : { value: null, reason };
export interface DecisionState {
  cash: ModelMetric;
  positionWeight: ModelMetric;
  largestWeight: ModelMetric;
  drift: ModelMetric;
  volatility: ModelMetric;
  beta: ModelMetric;
  var95: ModelMetric;
  diversification: ModelMetric;
  riskContribution: ModelMetric;
}
export function decisionState(
  positions: Position[],
  cash: number,
  targets: TargetAllocation[],
  symbol: string,
  a: PortfolioAnalytics,
  benchmarkReturns: DatedReturn[],
): DecisionState {
  const total = totalValue(positions, cash);
  const values = positions.map((p) => p.marketValue!);
  const securities = values.reduce((v, x) => v + x, 0);
  const position = positions.find((p) => p.symbol === symbol);
  const plan = buildRebalancePlan(positions, cash, targets, true, true);
  const generic =
    "Для риска нужны полная общая covariance matrix и положительная дисперсия.";
  const unavailable = metric(null, generic);
  const state: DecisionState = {
    cash: metric(cash, "Cash недоступен."),
    positionWeight: metric(
      total > EPS ? (position?.marketValue ?? 0) / total : null,
      "Нужна положительная стоимость счёта.",
    ),
    largestWeight: metric(
      total > EPS ? Math.max(0, ...values) / total : null,
      "Нужна положительная стоимость счёта.",
    ),
    drift: metric(plan.drift, plan.reason ?? "Цели не заданы."),
    volatility: unavailable,
    beta: unavailable,
    var95: unavailable,
    diversification: unavailable,
    riskContribution: unavailable,
  };
  const matrix = a.matrix;
  const unsupported = positions.some(
    (p) => p.marketValue! > EPS && !matrix?.symbols.includes(p.symbol),
  );
  const sampleValid =
    matrix &&
    matrix.returns.length === matrix.symbols.length &&
    matrix.observations === a.riskMatrix.required &&
    matrix.returns.every(
      (rs) =>
        rs.length === matrix.observations &&
        rs.every(
          (r, i) =>
            finite(r.value) &&
            r.startDate === matrix.returns[0][i].startDate &&
            r.date === matrix.returns[0][i].date,
        ),
    );
  if (!sampleValid || unsupported || securities <= EPS || total <= EPS) {
    const reason = unsupported
      ? "Для одного из активов нет общей истории в выбранном risk window."
      : (a.riskMatrix.reason ?? generic);
    for (const key of [
      "volatility",
      "beta",
      "var95",
      "diversification",
      "riskContribution",
    ] as const)
      state[key] = metric(null, reason);
    return state;
  }
  const weights = matrix.symbols.map(
    (s) =>
      (positions.find((p) => p.symbol === s)?.marketValue ?? 0) / securities,
  );
  const risk = riskContributions(matrix.symbols, weights, matrix.covariance);
  // Reuse the existing matrix; cash has zero modeled market risk (explicit assumption).
  const exposure = securities / total;
  const returns = matrix.returns[0].map((r, i) => ({
    ...r,
    value:
      matrix.returns.reduce((sum, rs, j) => sum + weights[j] * rs[i].value, 0) *
      exposure,
  }));
  const benchmark = benchmarkMetrics(returns, benchmarkReturns);
  const tail = historicalTailRisk(
    returns.map((r) => r.value),
    0.95,
    HISTORICAL_TAIL_MIN_OBSERVATIONS,
  );
  state.volatility = metric(risk ? risk.volatility * exposure : null, generic);
  state.diversification = metric(risk?.diversificationRatio, generic);
  state.riskContribution = metric(
    risk?.contributions.find((r) => r.symbol === symbol)?.fraction,
    "Нет позиции в risk universe или дисперсия не определена.",
  );
  state.beta = metric(
    benchmark.observations === returns.length ? benchmark.beta : null,
    "Нужны совпавшие интервалы benchmark и ненулевая дисперсия benchmark.",
  );
  state.var95 = metric(
    tail?.var,
    `VaR 95% требует минимум ${HISTORICAL_TAIL_MIN_OBSERVATIONS} общих наблюдений; сейчас ${returns.length}.`,
  );
  return state;
}
export interface DecisionResult {
  valid: boolean;
  reason: string | null;
  before: DecisionState | null;
  after: DecisionState | null;
  summary: string[];
}
export interface TradeDraft {
  symbol: string;
  type: "BUY" | "SELL";
  mode: "quantity" | "value";
  amount: number;
  price: number;
}
export function resolveTrade(d: TradeDraft): WhatIfInput {
  return {
    symbol: d.symbol.trim().toUpperCase(),
    type: d.type,
    quantity: d.mode === "value" ? d.amount / d.price : d.amount,
    price: d.price,
  };
}
export function simulateDecision(
  s: PortfolioSnapshot,
  c: PlanningConstraints,
  draft: TradeDraft,
  a: PortfolioAnalytics,
  benchmarkReturns: DatedReturn[],
): DecisionResult {
  const fail = (reason: string): DecisionResult => ({
    valid: false,
    reason,
    before: null,
    after: null,
    summary: [],
  });
  const reason = constraintReason(c) ?? valuationReason(s);
  if (reason) return fail(reason);
  const input = resolveTrade(draft);
  if (!["BUY", "SELL"].includes(input.type))
    return fail("Выберите BUY или SELL.");
  const targets = s.targetAllocation ?? [];
  const basic = simulateTradeWhatIf(
    s.positions,
    s.cashLedger!.balance,
    targets,
    true,
    true,
    input,
  );
  if (!basic.valid) return fail(basic.reason!);
  const p = s.positions.find((p) => p.symbol === input.symbol);
  if (!p || !finite(p.marketPrice))
    return fail(
      "Нет наблюдаемой рыночной котировки этого актива. Введённая цена исполнения не заменяет market data.",
    );
  if (input.type === "SELL" && (c.buyOnly || c.noSell))
    return fail("Продажи запрещены локальным ограничением.");
  const notional = input.quantity * input.price;
  if (!finite(notional) || notional < c.minimumTradeValue - EPS)
    return fail("Сумма сделки меньше minimum trade value или некорректна.");
  const quantity =
    p.quantity + (input.type === "BUY" ? input.quantity : -input.quantity);
  // Mark remaining inventory at the observed quote, not the execution price.
  const positions = s.positions
    .map((row) =>
      row.symbol === input.symbol
        ? { ...row, quantity, marketValue: quantity * p.marketPrice! }
        : { ...row },
    )
    .filter((row) => row.quantity > EPS);
  const cash = basic.cashAfter!;
  const total = totalValue(positions, cash);
  if (!finite(total) || total <= EPS)
    return fail("После сделки стоимость счёта должна быть положительной.");
  if (cash / total + EPS < c.minimumCashWeight)
    return fail("После сделки cash ниже minimum cash %.");
  const beforeTotal = totalValue(s.positions, s.cashLedger!.balance);
  if (
    positions.some(
      (row) =>
        row.marketValue! / total > c.maxPositionWeight + EPS &&
        row.marketValue! / total >
          (s.positions.find((p) => p.symbol === row.symbol)?.marketValue ?? 0) /
            beforeTotal +
            EPS,
    )
  )
    return fail("Сделка увеличивает позицию сверх max position weight.");
  const before = decisionState(
    s.positions,
    s.cashLedger!.balance,
    targets,
    input.symbol,
    a,
    benchmarkReturns,
  );
  const after = decisionState(
    positions,
    cash,
    targets,
    input.symbol,
    a,
    benchmarkReturns,
  );
  return {
    valid: true,
    reason: null,
    before,
    after,
    summary: decisionSummary(input.symbol, before, after),
  };
}
export function decisionSummary(
  symbol: string,
  before: DecisionState,
  after: DecisionState,
) {
  const lines: string[] = [];
  const percent = (v: number) =>
    (v * 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + "%";
  for (const [key, label] of [
    ["positionWeight", `Вес ${symbol}`],
    ["riskContribution", `Risk Contribution ${symbol}`],
    ["volatility", "Portfolio volatility"],
  ] as const) {
    const b = before[key].value,
      n = after[key].value;
    if (b !== null && n !== null && Math.abs(n - b) > EPS)
      lines.push(
        `${label} ${n > b ? "увеличивается" : "снижается"} с ${percent(b)} до ${percent(n)}.`,
      );
  }
  const b = before.drift.value,
    n = after.drift.value;
  if (b !== null && n !== null)
    lines.push(
      Math.abs(b - n) <= EPS
        ? "Portfolio drift не меняется."
        : `Portfolio drift относительно target ${n > b ? "увеличивается" : "уменьшается"}: ${percent(b)} → ${percent(n)}.`,
    );
  if (!lines.length)
    lines.push("Недостаточно доступных метрик для сравнения влияния сделки.");
  return lines;
}
export function planningMinimumVariance(a: PortfolioAnalytics) {
  const result =
    a.matrix && a.currentRisk
      ? minimumVariancePortfolio(
          a.matrix.symbols,
          a.currentRisk.contributions.map((p) => p.weight),
          a.matrix.covariance,
        )
      : null;
  return {
    result,
    reason: result
      ? null
      : (a.riskMatrix.reason ??
        "Нужны полная оценка и валидная covariance matrix."),
  };
}
