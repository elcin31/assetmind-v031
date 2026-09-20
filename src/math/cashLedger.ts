import type { CashEvent, CashLedgerSummary, Transaction } from '../types';

const EPS = 1e-6;
const round = (value: number) => Math.round(value * 1e8) / 1e8;
const normalizeCurrency = (value: string) => value.trim().toUpperCase();

interface LedgerOperation {
  id: string;
  timestamp: string;
  createdAt: string;
  delta: number;
  external: number;
  kind: string;
}

export interface CashLedgerEntry {
  id: string;
  timestamp: string;
  kind: string;
  delta: number;
  balance: number;
  externalFlow: number;
}

export interface CashLedgerResult extends CashLedgerSummary {
  entries: CashLedgerEntry[];
}

/**
 * Reconstruct the account cash balance from explicit funding/cash events and
 * trade executions. A negative running balance means the funding ledger is
 * incomplete; AssetMind refuses to infer the missing deposit.
 *
 * No FX conversion is performed here. Mixed currencies, or a currency that
 * differs from an explicitly supplied portfolio base currency, make the ledger
 * unavailable instead of silently adding unlike monetary units.
 */
export function buildCashLedger(
  transactions: Transaction[],
  cashEvents: CashEvent[],
  asOf = new Date().toISOString(),
  expectedCurrency?: string,
): CashLedgerResult {
  const cutoff = Date.parse(asOf);
  const operations: LedgerOperation[] = [];
  const normalizedExpected = expectedCurrency ? normalizeCurrency(expectedCurrency) : null;
  const currencies = new Set(
    [...transactions.map((tx) => tx.currency), ...cashEvents.map((event) => event.currency)]
      .map(normalizeCurrency)
      .filter(Boolean),
  );
  const currencyMismatch =
    currencies.size > 1 ||
    (normalizedExpected !== null &&
      (currencies.size === 0 || [...currencies].some((currency) => currency !== normalizedExpected)));

  if (currencyMismatch) {
    return {
      complete: false,
      balance: 0,
      minimumBalance: 0,
      reason: normalizedExpected
        ? `Cash ledger недоступен: операции должны быть в базовой валюте ${normalizedExpected}. FX-конвертация не подставляется автоматически.`
        : 'Cash ledger недоступен: обнаружены смешанные валюты без FX-истории.',
      deposits: 0,
      withdrawals: 0,
      dividends: 0,
      fees: 0,
      entries: [],
    };
  }

  for (const tx of transactions) {
    const time = Date.parse(tx.timestamp);
    if (!Number.isFinite(time) || time > cutoff) continue;
    const notional = tx.quantity * tx.price;
    if (!Number.isFinite(notional) || notional <= 0) continue;
    operations.push({
      id: tx.id,
      timestamp: tx.timestamp,
      createdAt: tx.created_at,
      delta: tx.type === 'BUY' ? -notional : notional,
      external: 0,
      kind: tx.type,
    });
  }

  let deposits = 0;
  let withdrawals = 0;
  let dividends = 0;
  let fees = 0;
  for (const event of cashEvents) {
    const time = Date.parse(event.timestamp);
    if (!Number.isFinite(time) || time > cutoff || !Number.isFinite(event.amount) || event.amount <= 0) continue;
    let delta = 0;
    let external = 0;
    if (event.kind === 'DEPOSIT') { delta = event.amount; external = event.amount; deposits += event.amount; }
    if (event.kind === 'WITHDRAWAL') { delta = -event.amount; external = -event.amount; withdrawals += event.amount; }
    if (event.kind === 'DIVIDEND') { delta = event.amount; dividends += event.amount; }
    if (event.kind === 'FEE') { delta = -event.amount; fees += event.amount; }
    operations.push({
      id: event.id,
      timestamp: event.timestamp,
      createdAt: event.created_at,
      delta,
      external,
      kind: event.kind,
    });
  }

  operations.sort((a, b) => {
    const byTime = Date.parse(a.timestamp) - Date.parse(b.timestamp);
    if (byTime) return byTime;
    const byCreated = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return byCreated || a.id.localeCompare(b.id);
  });

  let balance = 0;
  let minimumBalance = 0;
  let firstDeficit: CashLedgerEntry | null = null;
  const entries: CashLedgerEntry[] = [];
  for (const operation of operations) {
    balance = round(balance + operation.delta);
    if (Math.abs(balance) < EPS) balance = 0;
    minimumBalance = Math.min(minimumBalance, balance);
    const entry: CashLedgerEntry = {
      id: operation.id,
      timestamp: operation.timestamp,
      kind: operation.kind,
      delta: round(operation.delta),
      balance,
      externalFlow: round(operation.external),
    };
    entries.push(entry);
    if (!firstDeficit && balance < -EPS) firstDeficit = entry;
  }

  const complete = firstDeficit === null;
  return {
    complete,
    balance: round(balance),
    minimumBalance: round(minimumBalance),
    reason: complete
      ? null
      : `Cash ledger неполный: после операции ${firstDeficit!.kind} от ${new Date(firstDeficit!.timestamp).toLocaleDateString('ru-RU')} баланс становится отрицательным. Добавьте недостающее пополнение до этой операции.`,
    deposits: round(deposits),
    withdrawals: round(withdrawals),
    dividends: round(dividends),
    fees: round(fees),
    entries,
  };
}
