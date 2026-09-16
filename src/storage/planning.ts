import { supabase } from '../auth/supabase';
import type { CashEvent, CashEventKind, TargetAllocation } from '../types';
import { normalizeTargetAllocation } from '../math/rebalancing';

const CASH_TYPES: CashEventKind[] = ['DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE'];

export interface PlanningState {
  cashEvents: CashEvent[];
  targetAllocation: TargetAllocation[];
}

export type NewCashEvent = Pick<CashEvent, 'kind' | 'amount' | 'currency' | 'timestamp'> & { symbol?: string };

interface CloudCashRow {
  transaction_id: string;
  portfolio_id: string;
  type: CashEventKind;
  symbol: string | null;
  amount: number | string | null;
  currency: string;
  executed_at: string;
  recorded_at: string | null;
  created_at: string | null;
  client_request_id: string | null;
}

interface LocalPlanning {
  version: 1;
  portfolioId: string;
  currency: string;
  cashEvents: CashEvent[];
  targetAllocation: TargetAllocation[];
}

function planningKey(userId: string) {
  return `assetmind:${userId}:planning.v1`;
}

function empty(portfolioId: string, currency: string): LocalPlanning {
  return { version: 1, portfolioId, currency, cashEvents: [], targetAllocation: [] };
}

function validCashEvent(event: CashEvent, portfolioId: string, currency: string) {
  return Boolean(
    event && event.id && event.portfolio_id === portfolioId && CASH_TYPES.includes(event.kind) &&
    Number.isFinite(event.amount) && event.amount > 0 && event.currency === currency &&
    Number.isFinite(Date.parse(event.timestamp)) && Number.isFinite(Date.parse(event.created_at)) &&
    (!event.symbol || /^[A-Z0-9.-]{1,20}$/.test(event.symbol))
  );
}

function normalizeState(value: unknown, portfolioId: string, currency: string): LocalPlanning {
  if (!value || typeof value !== 'object') return empty(portfolioId, currency);
  const data = value as Partial<LocalPlanning>;
  if (data.version !== 1 || data.portfolioId !== portfolioId || data.currency !== currency) return empty(portfolioId, currency);
  const events = Array.isArray(data.cashEvents) ? data.cashEvents : [];
  if (!events.every((event) => validCashEvent(event, portfolioId, currency))) return empty(portfolioId, currency);
  if (new Set(events.map((event) => event.id)).size !== events.length) return empty(portfolioId, currency);
  let targets: TargetAllocation[];
  try { targets = normalizeTargetAllocation(data.targetAllocation ?? []); }
  catch { targets = []; }
  return { version: 1, portfolioId, currency, cashEvents: events, targetAllocation: targets };
}

function readLocal(userId: string, portfolioId: string, currency: string): LocalPlanning {
  try {
    const raw = localStorage.getItem(planningKey(userId));
    return raw ? normalizeState(JSON.parse(raw), portfolioId, currency) : empty(portfolioId, currency);
  } catch { return empty(portfolioId, currency); }
}

function writeLocal(userId: string, state: LocalPlanning, notify = true) {
  try { localStorage.setItem(planningKey(userId), JSON.stringify(state)); }
  catch { /* Supabase remains canonical; local planning cache is best-effort. */ }
  if (notify && typeof window !== 'undefined') window.dispatchEvent(new Event('assetmind:changed'));
}

function cloudMessage(error: { message?: string } | null | undefined) {
  return error?.message ? `Capital data sync failed: ${error.message}` : 'Capital data sync failed.';
}

function fromCloud(row: CloudCashRow): CashEvent | null {
  const amount = Number(row.amount);
  const event: CashEvent = {
    id: row.transaction_id,
    portfolio_id: row.portfolio_id,
    kind: row.type,
    amount,
    currency: row.currency,
    timestamp: row.executed_at,
    created_at: row.recorded_at ?? row.created_at ?? row.executed_at,
    ...(row.symbol ? { symbol: row.symbol.trim().toUpperCase() } : {}),
    ...(row.client_request_id ? { client_request_id: row.client_request_id } : {}),
  };
  return validCashEvent(event, row.portfolio_id, row.currency) ? event : null;
}

function toCloud(event: CashEvent, userId: string) {
  return {
    user_id: userId,
    portfolio_id: event.portfolio_id,
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
    source: 'assetmind-web',
    client_request_id: event.client_request_id ?? null,
  };
}

async function withLock<T>(userId: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(planningKey(userId), action);
  return action();
}

export async function readPlanningState(userId: string, portfolioId: string, currency: string): Promise<PlanningState> {
  const fallback = readLocal(userId, portfolioId, currency);
  if (!supabase) return fallback;
  try {
    const [portfolio, events] = await Promise.all([
      supabase.from('portfolios').select('target_allocation').eq('id', portfolioId).eq('user_id', userId).single(),
      supabase.from('transactions')
        .select('transaction_id,portfolio_id,type,symbol,amount,currency,executed_at,recorded_at,created_at,client_request_id')
        .eq('user_id', userId).eq('portfolio_id', portfolioId).in('type', CASH_TYPES)
        .order('executed_at', { ascending: true }).order('recorded_at', { ascending: true }),
    ]);
    if (portfolio.error) throw new Error(cloudMessage(portfolio.error));
    if (events.error) throw new Error(cloudMessage(events.error));
    const cashEvents = (events.data ?? []).flatMap((row) => {
      const event = fromCloud(row as CloudCashRow);
      return event ? [event] : [];
    });
    const targetAllocation = normalizeTargetAllocation(portfolio.data?.target_allocation ?? []);
    writeLocal(userId, { version: 1, portfolioId, currency, cashEvents, targetAllocation }, false);
    return { cashEvents, targetAllocation };
  } catch (error) {
    console.warn('[AssetMind capital sync]', error);
    return fallback;
  }
}

function normalizeInput(input: NewCashEvent, currency: string): NewCashEvent {
  const symbol = input.symbol?.trim().toUpperCase() || undefined;
  if (!CASH_TYPES.includes(input.kind) || !Number.isFinite(input.amount) || input.amount <= 0 || input.currency !== currency || !Number.isFinite(Date.parse(input.timestamp)) || (symbol && !/^[A-Z0-9.-]{1,20}$/.test(symbol))) {
    throw new Error('Проверьте тип, сумму, валюту, дату и тикер денежной операции.');
  }
  return { ...input, symbol };
}

function sameInput(event: CashEvent, input: NewCashEvent) {
  return event.kind === input.kind && event.amount === input.amount && event.currency === input.currency && event.timestamp === input.timestamp && (event.symbol ?? '') === (input.symbol ?? '');
}

export async function addCashEvent(inputRaw: NewCashEvent, requestId: string, userId: string, portfolioId: string, currency: string) {
  const input = normalizeInput(inputRaw, currency);
  return withLock(userId, async () => {
    const state = await readPlanningState(userId, portfolioId, currency);
    const existing = state.cashEvents.find((event) => event.client_request_id === requestId);
    if (existing) {
      if (!sameInput(existing, input)) throw new Error('Retry ID был повторно использован для другой денежной операции.');
      return existing;
    }
    const event: CashEvent = {
      ...input,
      id: crypto.randomUUID(),
      portfolio_id: portfolioId,
      created_at: new Date().toISOString(),
      client_request_id: requestId,
    };
    if (supabase) {
      const result = await supabase.from('transactions').insert(toCloud(event, userId));
      if (result.error) {
        if (result.error.code === '23505') {
          const retry = await supabase.from('transactions')
            .select('transaction_id,portfolio_id,type,symbol,amount,currency,executed_at,recorded_at,created_at,client_request_id')
            .eq('user_id', userId).eq('portfolio_id', portfolioId).eq('client_request_id', requestId).maybeSingle();
          if (!retry.error && retry.data) {
            const remote = fromCloud(retry.data as CloudCashRow);
            if (remote && sameInput(remote, input)) return remote;
          }
        }
        throw new Error(cloudMessage(result.error));
      }
    }
    writeLocal(userId, { version: 1, portfolioId, currency, targetAllocation: state.targetAllocation, cashEvents: [...state.cashEvents, event] });
    return event;
  });
}

export async function updateCashEvent(eventId: string, inputRaw: NewCashEvent, userId: string, portfolioId: string, currency: string) {
  const input = normalizeInput(inputRaw, currency);
  return withLock(userId, async () => {
    const state = await readPlanningState(userId, portfolioId, currency);
    const index = state.cashEvents.findIndex((event) => event.id === eventId);
    if (index < 0) throw new Error('Денежная операция не найдена. Обновите портфель.');
    const updated: CashEvent = { ...state.cashEvents[index], ...input, portfolio_id: portfolioId };
    if (supabase) {
      const result = await supabase.from('transactions').update({
        date: updated.timestamp.slice(0, 10), type: updated.kind, symbol: updated.symbol ?? null,
        amount: updated.amount, fees: updated.kind === 'FEE' ? updated.amount : null,
        currency: updated.currency, executed_at: updated.timestamp,
      }).eq('user_id', userId).eq('portfolio_id', portfolioId).eq('transaction_id', eventId);
      if (result.error) throw new Error(cloudMessage(result.error));
    }
    const cashEvents = [...state.cashEvents]; cashEvents[index] = updated;
    writeLocal(userId, { version: 1, portfolioId, currency, targetAllocation: state.targetAllocation, cashEvents });
    return updated;
  });
}

export async function deleteCashEvent(eventId: string, userId: string, portfolioId: string, currency: string) {
  return withLock(userId, async () => {
    const state = await readPlanningState(userId, portfolioId, currency);
    if (!state.cashEvents.some((event) => event.id === eventId)) throw new Error('Денежная операция не найдена. Обновите портфель.');
    if (supabase) {
      const result = await supabase.from('transactions').delete().eq('user_id', userId).eq('portfolio_id', portfolioId).eq('transaction_id', eventId);
      if (result.error) throw new Error(cloudMessage(result.error));
    }
    writeLocal(userId, { ...state, version: 1, portfolioId, currency, cashEvents: state.cashEvents.filter((event) => event.id !== eventId) });
  });
}

export async function updateTargetAllocation(targetsInput: TargetAllocation[], userId: string, portfolioId: string, currency: string) {
  const targets = normalizeTargetAllocation(targetsInput);
  return withLock(userId, async () => {
    const state = await readPlanningState(userId, portfolioId, currency);
    if (supabase) {
      const result = await supabase.from('portfolios').update({ target_allocation: targets, updated_at: new Date().toISOString() }).eq('id', portfolioId).eq('user_id', userId);
      if (result.error) throw new Error(cloudMessage(result.error));
    }
    writeLocal(userId, { ...state, version: 1, portfolioId, currency, targetAllocation: targets });
    return targets;
  });
}
