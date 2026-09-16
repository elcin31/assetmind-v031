import type { Position, TargetAllocation } from '../types';

const EPS = 1e-8;
const round = (value: number) => Math.round(value * 1e8) / 1e8;

export interface RebalanceRow {
  symbol: string;
  currentWeight: number;
  targetWeight: number;
  currentValue: number;
  targetValue: number;
  delta: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  quantity: number | null;
}

export interface RebalancePlan {
  available: boolean;
  reason: string | null;
  totalValue: number | null;
  cashWeight: number | null;
  targetCashWeight: number;
  drift: number | null;
  rows: RebalanceRow[];
}

export interface WhatIfInput {
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
}

export interface WhatIfResult {
  valid: boolean;
  reason: string | null;
  accountValue: number | null;
  cashBefore: number;
  cashAfter: number | null;
  largestWeightBefore: number | null;
  largestWeightAfter: number | null;
  targetDriftBefore: number | null;
  targetDriftAfter: number | null;
}

export function normalizeTargetAllocation(value: unknown): TargetAllocation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: TargetAllocation[] = [];
  let total = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('Некорректная target allocation.');
    const raw = item as { symbol?: unknown; weight?: unknown };
    const symbol = typeof raw.symbol === 'string' ? raw.symbol.trim().toUpperCase() : '';
    const weight = typeof raw.weight === 'number' ? raw.weight : Number(raw.weight);
    if (!/^[A-Z0-9.-]{1,20}$/.test(symbol) || seen.has(symbol) || !Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw new Error('Некорректная target allocation. Проверьте тикеры и веса.');
    }
    seen.add(symbol);
    total += weight;
    result.push({ symbol, weight: round(weight) });
  }
  if (total > 1 + EPS) throw new Error('Сумма target weights не может превышать 100%. Остаток считается целевым CASH.');
  return result.sort((a, b) => b.weight - a.weight || a.symbol.localeCompare(b.symbol));
}

export function targetCashWeight(targets: TargetAllocation[]): number {
  return Math.max(0, round(1 - targets.reduce((sum, target) => sum + target.weight, 0)));
}

function driftFromValues(values: Map<string, number>, cash: number, targets: TargetAllocation[], total: number): number | null {
  if (!(total > 0)) return null;
  const targetMap = new Map(targets.map((target) => [target.symbol, target.weight]));
  const symbols = new Set([...values.keys(), ...targetMap.keys()]);
  let absolute = Math.abs(cash / total - targetCashWeight(targets));
  for (const symbol of symbols) absolute += Math.abs((values.get(symbol) ?? 0) / total - (targetMap.get(symbol) ?? 0));
  return round(absolute / 2);
}

function largestWeight(values: Map<string, number>, total: number): number | null {
  if (!(total > 0) || !values.size) return null;
  return round(Math.max(...values.values()) / total);
}

export function buildRebalancePlan(
  positions: Position[],
  cashBalance: number,
  targetsInput: TargetAllocation[],
  cashLedgerComplete: boolean,
  valuationComplete: boolean,
): RebalancePlan {
  const targets = normalizeTargetAllocation(targetsInput);
  const targetCash = targetCashWeight(targets);
  if (!targets.length) return { available: false, reason: 'Сначала задайте target allocation.', totalValue: null, cashWeight: null, targetCashWeight: targetCash, drift: null, rows: [] };
  if (!cashLedgerComplete) return { available: false, reason: 'Rebalancing требует полного cash ledger.', totalValue: null, cashWeight: null, targetCashWeight: targetCash, drift: null, rows: [] };
  if (!valuationComplete || positions.some((position) => position.marketValue === undefined)) return { available: false, reason: 'Rebalancing требует котировок всех открытых позиций.', totalValue: null, cashWeight: null, targetCashWeight: targetCash, drift: null, rows: [] };

  const values = new Map(positions.map((position) => [position.symbol, position.marketValue ?? 0]));
  const prices = new Map(positions.map((position) => [position.symbol, position.marketPrice ?? null]));
  const total = [...values.values()].reduce((sum, value) => sum + value, 0) + cashBalance;
  if (!(total > 0)) return { available: false, reason: 'Стоимость счёта должна быть положительной.', totalValue: null, cashWeight: null, targetCashWeight: targetCash, drift: null, rows: [] };

  const targetMap = new Map(targets.map((target) => [target.symbol, target.weight]));
  const symbols = new Set([...values.keys(), ...targetMap.keys()]);
  const threshold = Math.max(1, total * 0.001);
  const rows = [...symbols].map((symbol): RebalanceRow => {
    const currentValue = values.get(symbol) ?? 0;
    const targetWeight = targetMap.get(symbol) ?? 0;
    const targetValue = total * targetWeight;
    const delta = targetValue - currentValue;
    const action = Math.abs(delta) <= threshold ? 'HOLD' : delta > 0 ? 'BUY' : 'SELL';
    const price = prices.get(symbol) ?? null;
    return {
      symbol,
      currentWeight: round(currentValue / total),
      targetWeight,
      currentValue: round(currentValue),
      targetValue: round(targetValue),
      delta: round(delta),
      action,
      quantity: action === 'HOLD' || !price || price <= 0 ? null : round(Math.abs(delta) / price),
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    available: true,
    reason: null,
    totalValue: round(total),
    cashWeight: round(cashBalance / total),
    targetCashWeight: targetCash,
    drift: driftFromValues(values, cashBalance, targets, total),
    rows,
  };
}

export function simulateTradeWhatIf(
  positions: Position[],
  cashBalance: number,
  targetsInput: TargetAllocation[],
  cashLedgerComplete: boolean,
  valuationComplete: boolean,
  input: WhatIfInput,
): WhatIfResult {
  const invalid = (reason: string): WhatIfResult => ({ valid: false, reason, accountValue: null, cashBefore: cashBalance, cashAfter: null, largestWeightBefore: null, largestWeightAfter: null, targetDriftBefore: null, targetDriftAfter: null });
  if (!cashLedgerComplete) return invalid('What-If требует полного cash ledger.');
  if (!valuationComplete || positions.some((position) => position.marketValue === undefined)) return invalid('What-If требует полной рыночной оценки.');
  const symbol = input.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,20}$/.test(symbol) || !Number.isFinite(input.quantity) || input.quantity <= 0 || !Number.isFinite(input.price) || input.price <= 0) return invalid('Проверьте тикер, количество и цену сценария.');

  const values = new Map(positions.map((position) => [position.symbol, position.marketValue ?? 0]));
  const position = positions.find((item) => item.symbol === symbol);
  if (input.type === 'SELL' && (!position || input.quantity > position.quantity + EPS)) return invalid('Нельзя продать больше текущей позиции.');
  const tradeValue = input.quantity * input.price;
  if (input.type === 'BUY' && tradeValue > cashBalance + EPS) return invalid('Для этого BUY недостаточно reconciled cash.');

  const totalBefore = [...values.values()].reduce((sum, value) => sum + value, 0) + cashBalance;
  if (!(totalBefore > 0)) return invalid('Стоимость счёта должна быть положительной.');
  const beforeLargest = largestWeight(values, totalBefore);
  const targets = normalizeTargetAllocation(targetsInput);
  const beforeDrift = targets.length ? driftFromValues(values, cashBalance, targets, totalBefore) : null;

  const sign = input.type === 'BUY' ? 1 : -1;
  const nextValue = Math.max(0, (values.get(symbol) ?? 0) + sign * tradeValue);
  if (nextValue <= EPS) values.delete(symbol); else values.set(symbol, nextValue);
  const cashAfter = round(cashBalance - sign * tradeValue);
  const totalAfter = [...values.values()].reduce((sum, value) => sum + value, 0) + cashAfter;

  return {
    valid: true,
    reason: null,
    accountValue: round(totalAfter),
    cashBefore: round(cashBalance),
    cashAfter,
    largestWeightBefore: beforeLargest,
    largestWeightAfter: largestWeight(values, totalAfter),
    targetDriftBefore: beforeDrift,
    targetDriftAfter: targets.length ? driftFromValues(values, cashAfter, targets, totalAfter) : null,
  };
}
