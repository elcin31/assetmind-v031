import type { CashEvent, MoneyWeightedMetrics } from '../types';

export interface DatedCashFlow {
  date: string;
  amount: number;
}

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365.25;
const ROOT_EPS = 1e-10;

function normalizedFlows(flows: DatedCashFlow[]) {
  return flows
    .filter((flow) => Number.isFinite(flow.amount) && Number.isFinite(Date.parse(flow.date)))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

export function xnpv(rate: number, flows: DatedCashFlow[]): number | null {
  if (!Number.isFinite(rate) || rate <= -1) return null;
  const sorted = normalizedFlows(flows);
  if (!sorted.length) return null;
  const start = Date.parse(sorted[0].date);
  let value = 0;
  for (const flow of sorted) {
    const years = (Date.parse(flow.date) - start) / DAY_MS / YEAR_DAYS;
    const discounted = flow.amount / ((1 + rate) ** years);
    if (!Number.isFinite(discounted)) return null;
    value += discounted;
  }
  return Number.isFinite(value) ? value : null;
}

/** Robust single-root XIRR. Ambiguous multiple roots deliberately return null. */
export function xirr(flows: DatedCashFlow[]): number | null {
  const sorted = normalizedFlows(flows);
  if (sorted.length < 2) return null;
  if (!sorted.some((flow) => flow.amount < 0) || !sorted.some((flow) => flow.amount > 0)) return null;
  if (Date.parse(sorted.at(-1)!.date) === Date.parse(sorted[0].date)) return null;

  const grid = [-0.9999, -0.99, -0.9, -0.75, -0.5, -0.25, 0, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 500, 1000];
  const brackets: Array<[number, number]> = [];
  let previousRate = grid[0];
  let previousValue = xnpv(previousRate, sorted);
  if (previousValue === null) return null;

  for (const rate of grid.slice(1)) {
    const value = xnpv(rate, sorted);
    if (value === null) continue;
    if (Math.abs(previousValue) < ROOT_EPS) return previousRate;
    if (Math.abs(value) < ROOT_EPS) return rate;
    if (Math.sign(previousValue) !== Math.sign(value)) brackets.push([previousRate, rate]);
    previousRate = rate;
    previousValue = value;
  }
  if (brackets.length !== 1) return null;

  let [low, high] = brackets[0];
  let lowValue = xnpv(low, sorted)!;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const value = xnpv(mid, sorted);
    if (value === null) return null;
    if (Math.abs(value) < ROOT_EPS || Math.abs(high - low) < ROOT_EPS) return mid;
    if (Math.sign(value) === Math.sign(lowValue)) {
      low = mid;
      lowValue = value;
    } else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Investor-perspective MWR: deposits are negative cash flows, withdrawals are
 * positive, and the current reconciled account value is the terminal positive flow.
 * Dividends/fees stay inside account value and therefore are not external flows.
 */
export function moneyWeightedReturn(
  events: CashEvent[],
  terminalValue: number | null,
  asOf: string,
  cashLedgerComplete: boolean,
): MoneyWeightedMetrics {
  const external = events
    .filter((event) => (event.kind === 'DEPOSIT' || event.kind === 'WITHDRAWAL') && Date.parse(event.timestamp) <= Date.parse(asOf))
    .map((event) => ({
      date: event.timestamp,
      amount: event.kind === 'DEPOSIT' ? -event.amount : event.amount,
    }));

  if (!cashLedgerComplete) return { xirr: null, cashFlowCount: external.length, reason: 'XIRR недоступен: сначала восстановите полный cash ledger без отрицательного денежного остатка.' };
  if (terminalValue === null || !Number.isFinite(terminalValue) || terminalValue < 0) return { xirr: null, cashFlowCount: external.length, reason: 'XIRR требует полной текущей оценки активов и денежного остатка.' };
  if (!external.some((flow) => flow.amount < 0)) return { xirr: null, cashFlowCount: external.length, reason: 'Для XIRR нужен хотя бы один DEPOSIT: AssetMind не будет угадывать исходный капитал.' };

  const flows = [...external, { date: asOf, amount: terminalValue }];
  const value = xirr(flows);
  return {
    xirr: value,
    cashFlowCount: external.length,
    reason: value === null ? 'XIRR не имеет единственного устойчивого решения для текущего набора денежных потоков.' : null,
  };
}
