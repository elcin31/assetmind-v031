import { supabase } from '../auth/supabase';
import type { CashEvent, Portfolio, TargetAllocation, Transaction } from '../types';
import {
  importPortfolio,
  readPortfolioSynced,
  validatePortfolio,
  type LocalPortfolio,
} from './portfolio';
import { readPlanningState, type PlanningState } from './planning';
import { normalizeTargetAllocation } from '../math/rebalancing';
import {
  loadAnalyticsPreferences,
  normalizeAnalyticsPreferences,
  saveAnalyticsPreferences,
  type AnalyticsPreferences,
} from '../analytics/preferences';

const BACKUP_FORMAT = 'assetmind-account-backup';
const BACKUP_VERSION = 1;
const CASH_KINDS = new Set(['DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE']);

export interface AccountBackupV1 {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  portfolio: Portfolio;
  transactions: Transaction[];
  cashEvents: CashEvent[];
  targetAllocation: TargetAllocation[];
  analyticsPreferences: AnalyticsPreferences;
}

export interface RestoreSummary {
  kind: 'account' | 'legacy-trades';
  importedTransactions: number;
  importedCashEvents: number;
  targetCount: number;
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function sameTransactionIdNamespace(transactions: Transaction[], cashEvents: CashEvent[]) {
  const ids = new Set(transactions.map((tx) => tx.id));
  return cashEvents.every((event) => !ids.has(event.id));
}

function normalizeCashEvents(value: unknown, portfolio: Portfolio, transactionRequestIds: Set<string>): CashEvent[] {
  if (!Array.isArray(value)) throw new Error('Backup cash ledger is missing or invalid.');
  const ids = new Set<string>();
  const requestIds = new Set<string>();
  return value.map((raw): CashEvent => {
    if (!raw || typeof raw !== 'object') throw new Error('Backup contains an invalid cash event.');
    const event = raw as Partial<CashEvent>;
    const id = typeof event.id === 'string' ? event.id : '';
    const kind = typeof event.kind === 'string' ? event.kind : '';
    const symbol = event.symbol === undefined ? undefined : String(event.symbol).trim().toUpperCase();
    const amount = Number(event.amount);
    const requestId = event.client_request_id;
    if (
      !id || id.length > 200 || ids.has(id) || event.portfolio_id !== portfolio.id ||
      !CASH_KINDS.has(kind) || !Number.isFinite(amount) || amount <= 0 ||
      event.currency !== portfolio.base_currency || !isDate(event.timestamp) || !isDate(event.created_at) ||
      (symbol !== undefined && !/^[A-Z0-9.-]{1,20}$/.test(symbol)) ||
      (requestId !== undefined && (typeof requestId !== 'string' || !requestId || requestId.length > 200 || requestIds.has(requestId) || transactionRequestIds.has(requestId)))
    ) throw new Error('Backup contains an invalid or duplicate cash event.');
    ids.add(id);
    if (requestId) requestIds.add(requestId);
    return {
      id,
      portfolio_id: portfolio.id,
      kind: kind as CashEvent['kind'],
      amount,
      currency: portfolio.base_currency,
      timestamp: event.timestamp!,
      created_at: event.created_at!,
      ...(symbol ? { symbol } : {}),
      ...(requestId ? { client_request_id: requestId } : {}),
    };
  });
}

export function validateAccountBackup(value: unknown): AccountBackupV1 {
  if (!value || typeof value !== 'object') throw new Error('Invalid AssetMind account backup.');
  const raw = value as Partial<AccountBackupV1>;
  if (raw.format !== BACKUP_FORMAT || raw.version !== BACKUP_VERSION || !isDate(raw.exportedAt)) {
    throw new Error('Unsupported AssetMind account backup version.');
  }
  const validatedPortfolio = validatePortfolio({
    version: 1,
    portfolio: raw.portfolio,
    transactions: raw.transactions,
  } as LocalPortfolio);
  const transactionRequestIds = new Set(validatedPortfolio.transactions.flatMap((tx) => tx.client_request_id ? [tx.client_request_id] : []));
  const cashEvents = normalizeCashEvents(raw.cashEvents, validatedPortfolio.portfolio, transactionRequestIds);
  if (!sameTransactionIdNamespace(validatedPortfolio.transactions, cashEvents)) {
    throw new Error('Backup reuses an ID for both a trade and a cash event.');
  }
  const targetAllocation = normalizeTargetAllocation(raw.targetAllocation ?? []);
  const analyticsPreferences = normalizeAnalyticsPreferences(raw.analyticsPreferences);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: raw.exportedAt,
    portfolio: validatedPortfolio.portfolio,
    transactions: validatedPortfolio.transactions,
    cashEvents,
    targetAllocation,
    analyticsPreferences,
  };
}

export function buildAccountBackup(
  portfolio: LocalPortfolio,
  planning: PlanningState,
  analyticsPreferences: AnalyticsPreferences,
  exportedAt = new Date().toISOString(),
): AccountBackupV1 {
  return validateAccountBackup({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    portfolio: portfolio.portfolio,
    transactions: portfolio.transactions,
    cashEvents: planning.cashEvents,
    targetAllocation: planning.targetAllocation,
    analyticsPreferences,
  });
}

function sameCashEvent(a: CashEvent, b: CashEvent) {
  return a.id === b.id && a.kind === b.kind && a.amount === b.amount && a.currency === b.currency &&
    a.timestamp === b.timestamp && a.created_at === b.created_at && (a.symbol ?? '') === (b.symbol ?? '') &&
    (a.client_request_id ?? '') === (b.client_request_id ?? '');
}

/** Pure merge planner used by restore and tests. Existing data is never deleted. */
export function planCashEventRestore(
  current: CashEvent[],
  incoming: CashEvent[],
  portfolioId: string,
  currency: string,
  reservedIds: Set<string> = new Set(),
  reservedRequestIds: Set<string> = new Set(),
) {
  const byId = new Map(current.map((event) => [event.id, event]));
  const byRequest = new Map(current.flatMap((event) => event.client_request_id ? [[event.client_request_id, event] as const] : []));
  const missing: CashEvent[] = [];
  for (const source of incoming) {
    const event: CashEvent = { ...source, portfolio_id: portfolioId, currency };
    if (reservedIds.has(event.id)) throw new Error('Backup cash event conflicts with an existing trade ID. Nothing was deleted.');
    if (event.client_request_id && reservedRequestIds.has(event.client_request_id)) throw new Error('Backup cash event conflicts with an existing trade retry ID. Nothing was deleted.');
    const existing = byId.get(event.id);
    if (existing) {
      if (!sameCashEvent(existing, event)) throw new Error('Backup conflicts with an existing cash event. Nothing was deleted.');
      continue;
    }
    if (event.client_request_id) {
      const retry = byRequest.get(event.client_request_id);
      if (retry && !sameCashEvent(retry, event)) throw new Error('Backup retry ID conflicts with an existing cash event. Nothing was deleted.');
    }
    missing.push(event);
    byId.set(event.id, event);
    if (event.client_request_id) byRequest.set(event.client_request_id, event);
  }
  return { merged: [...byId.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)), missing };
}

function cashRow(event: CashEvent, userId: string, portfolioId: string) {
  return {
    user_id: userId,
    portfolio_id: portfolioId,
    transaction_id: event.id,
    date: event.timestamp.slice(0, 10),
    type: event.kind,
    symbol: event.symbol ?? null,
    quantity: null,
    price: null,
    fees: event.kind === 'FEE' ? event.amount : null,
    amount: event.amount,
    currency: event.currency,
    executed_at: event.timestamp,
    recorded_at: event.created_at,
    source: 'assetmind-backup',
    client_request_id: event.client_request_id ?? null,
  };
}

function planningStorageKey(userId: string) {
  return `assetmind:${userId}:planning.v1`;
}

async function restorePlanning(
  backup: AccountBackupV1,
  userId: string,
  current: LocalPortfolio,
): Promise<number> {
  const planning = await readPlanningState(userId, current.portfolio.id, current.portfolio.base_currency);
  const reservedIds = new Set(current.transactions.map((tx) => tx.id));
  const reservedRequestIds = new Set(current.transactions.flatMap((tx) => tx.client_request_id ? [tx.client_request_id] : []));
  const incoming = backup.cashEvents.map((event) => ({ ...event, portfolio_id: current.portfolio.id, currency: current.portfolio.base_currency }));
  const plan = planCashEventRestore(planning.cashEvents, incoming, current.portfolio.id, current.portfolio.base_currency, reservedIds, reservedRequestIds);

  if (supabase) {
    if (plan.missing.length) {
      const insert = await supabase.from('transactions').insert(plan.missing.map((event) => cashRow(event, userId, current.portfolio.id)));
      if (insert.error) throw new Error(`Cash backup restore failed: ${insert.error.message}`);
    }
    const target = await supabase.from('portfolios')
      .update({ target_allocation: backup.targetAllocation, updated_at: new Date().toISOString() })
      .eq('id', current.portfolio.id)
      .eq('user_id', userId);
    if (target.error) throw new Error(`Target allocation restore failed: ${target.error.message}`);
  } else {
    localStorage.setItem(planningStorageKey(userId), JSON.stringify({
      version: 1,
      portfolioId: current.portfolio.id,
      currency: current.portfolio.base_currency,
      cashEvents: plan.merged,
      targetAllocation: backup.targetAllocation,
    }));
  }
  return plan.missing.length;
}

function downloadJson(value: unknown, filename: string) {
  const raw = JSON.stringify(value, null, 2);
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportAccountBackup(userId: string) {
  const portfolio = await readPortfolioSynced(userId);
  const [planning, preferences] = await Promise.all([
    readPlanningState(userId, portfolio.portfolio.id, portfolio.portfolio.base_currency),
    loadAnalyticsPreferences(userId),
  ]);
  const backup = buildAccountBackup(portfolio, planning, preferences);
  downloadJson(backup, `assetmind-account-backup-${backup.exportedAt.slice(0, 10)}.json`);
  return backup;
}

export async function importAccountBackup(raw: string, userId: string): Promise<RestoreSummary> {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('Backup is not valid JSON. Existing data was preserved.'); }

  // Backward compatibility with the pre-P3 BUY/SELL-only backup format.
  if (parsed && typeof parsed === 'object' && (parsed as { version?: unknown }).version === 1 && (parsed as { format?: unknown }).format === undefined) {
    validatePortfolio(parsed);
    const before = await readPortfolioSynced(userId);
    await importPortfolio(raw, userId);
    const after = await readPortfolioSynced(userId);
    return { kind: 'legacy-trades', importedTransactions: Math.max(0, after.transactions.length - before.transactions.length), importedCashEvents: 0, targetCount: 0 };
  }

  const backup = validateAccountBackup(parsed);
  const current = await readPortfolioSynced(userId);
  if (current.portfolio.base_currency !== backup.portfolio.base_currency) {
    throw new Error('Backup uses another base currency. Existing data was preserved.');
  }

  // Validate planning conflicts before the first write. Restore is merge-only and idempotent;
  // if a network failure interrupts later writes, importing the same file again safely resumes it.
  const currentPlanning = await readPlanningState(userId, current.portfolio.id, current.portfolio.base_currency);
  planCashEventRestore(
    currentPlanning.cashEvents,
    backup.cashEvents,
    current.portfolio.id,
    current.portfolio.base_currency,
    new Set(current.transactions.map((tx) => tx.id)),
    new Set(current.transactions.flatMap((tx) => tx.client_request_id ? [tx.client_request_id] : [])),
  );

  const beforeTransactions = current.transactions.length;
  await importPortfolio(JSON.stringify({ version: 1, portfolio: backup.portfolio, transactions: backup.transactions }), userId);
  const afterTrades = await readPortfolioSynced(userId);
  const importedCashEvents = await restorePlanning(backup, userId, afterTrades);
  await saveAnalyticsPreferences(userId, backup.analyticsPreferences);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('assetmind:changed'));
  return {
    kind: 'account',
    importedTransactions: Math.max(0, afterTrades.transactions.length - beforeTransactions),
    importedCashEvents,
    targetCount: backup.targetAllocation.length,
  };
}
