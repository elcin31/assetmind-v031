import type { Portfolio, Transaction } from '../types';
import { supabase } from '../auth/supabase';
import { calculatePositions } from '../math/positions';

export const LEGACY_STORAGE_KEY = 'assetmind.portfolio.v1';
export interface LocalPortfolio { version: 1; portfolio: Portfolio; transactions: Transaction[] }
export type NewTransaction = Pick<Transaction, 'symbol' | 'type' | 'quantity' | 'price' | 'currency' | 'timestamp'>;

interface CloudPortfolioRow {
  id: string;
  user_id: string;
  name: string;
  base_currency: string;
  created_at: string;
}

interface CloudTransactionRow {
  transaction_id: string;
  portfolio_id: string;
  type: 'BUY' | 'SELL';
  symbol: string;
  quantity: number;
  price: number;
  currency: string;
  executed_at: string;
  recorded_at: string | null;
  created_at: string | null;
  client_request_id: string | null;
}

const isDate = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;

export function getPortfolioStorageKey(userId: string): string {
  const normalized = userId.trim();
  if (!normalized || normalized.length > 128 || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error('A valid signed-in user is required to access portfolio data.');
  }
  return `assetmind:${normalized}:portfolio.v1`;
}

export function validatePortfolio(value: unknown): LocalPortfolio {
  if (!value || typeof value !== 'object') throw new Error('Invalid backup file.');
  const data = value as LocalPortfolio;
  const p = data.portfolio;
  if (data.version !== 1 || !p || !nonempty(p.id) || !nonempty(p.name) || !/^[A-Z]{3}$/.test(p.base_currency) || !isDate(p.created_at) || !Array.isArray(data.transactions)) {
    throw new Error('Unsupported or damaged portfolio data.');
  }
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const tx of data.transactions) {
    if (!tx || !nonempty(tx.id) || ids.has(tx.id) || tx.portfolio_id !== p.id || typeof tx.symbol !== 'string' || !/^[A-Z0-9.-]{1,20}$/.test(tx.symbol) || !['BUY', 'SELL'].includes(tx.type) || !Number.isFinite(tx.quantity) || tx.quantity <= 0 || !Number.isFinite(tx.price) || tx.price <= 0 || tx.currency !== p.base_currency || !isDate(tx.timestamp) || !isDate(tx.created_at) || (tx.client_request_id !== undefined && (!nonempty(tx.client_request_id) || keys.has(tx.client_request_id)))) {
      throw new Error('Invalid or duplicate transaction in portfolio data.');
    }
    ids.add(tx.id);
    if (tx.client_request_id) keys.add(tx.client_request_id);
  }
  if (calculatePositions(data.transactions).hadInvalidSell) throw new Error('SELL quantity exceeds the position available on that date.');
  return data;
}

function parseSavedPortfolio(raw: string): LocalPortfolio {
  try { return validatePortfolio(JSON.parse(raw)); }
  catch { throw new Error('Saved portfolio is damaged or unsupported. It has not been overwritten. Export it before recovery.'); }
}

function migrateLegacyPortfolio(storageKey: string): LocalPortfolio | null {
  let legacyRaw: string | null;
  try { legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY); }
  catch { throw new Error('Browser storage is unavailable. Allow site storage to save your portfolio.'); }
  if (legacyRaw === null) return null;

  const portfolio = parseSavedPortfolio(legacyRaw);
  try {
    localStorage.setItem(storageKey, legacyRaw);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    if (localStorage.getItem(LEGACY_STORAGE_KEY) !== null) {
      localStorage.removeItem(storageKey);
      throw new Error('Legacy data could not be isolated safely.');
    }
  } catch {
    try { localStorage.removeItem(storageKey); } catch { /* Keep the original error. */ }
    throw new Error('Existing portfolio data could not be moved into your private account storage. No data was intentionally deleted.');
  }

  return portfolio;
}

export function readPortfolio(userId: string): LocalPortfolio {
  const storageKey = getPortfolioStorageKey(userId);
  let raw: string | null;
  try { raw = localStorage.getItem(storageKey); }
  catch { throw new Error('Browser storage is unavailable. Allow site storage to save your portfolio.'); }
  if (raw !== null) return parseSavedPortfolio(raw);

  const migrated = migrateLegacyPortfolio(storageKey);
  if (migrated) return migrated;

  return {
    version: 1,
    portfolio: {
      id: `local-${userId}`,
      name: 'My Portfolio',
      base_currency: 'USD',
      created_at: new Date().toISOString(),
    },
    transactions: [],
  };
}

function writePortfolio(data: LocalPortfolio, userId: string, notify = true) {
  validatePortfolio(data);
  const storageKey = getPortfolioStorageKey(userId);
  try { localStorage.setItem(storageKey, JSON.stringify(data)); }
  catch { throw new Error('Portfolio could not be saved. Browser storage is full or blocked. Export a backup and free space.'); }
  if (notify && typeof window !== 'undefined') window.dispatchEvent(new Event('assetmind:changed'));
}

function cloudMessage(error: { message?: string } | null | undefined): string {
  return error?.message ? `Cloud portfolio sync failed: ${error.message}` : 'Cloud portfolio sync failed.';
}

async function withStorageLock<T>(userId: string, action: () => Promise<T> | T): Promise<T> {
  if (!navigator.locks) throw new Error('Please use an up-to-date browser with Web Locks support to save safely.');
  return navigator.locks.request(getPortfolioStorageKey(userId), action);
}

async function ensureCloudPortfolio(userId: string, local: LocalPortfolio): Promise<CloudPortfolioRow> {
  if (!supabase) throw new Error('Cloud portfolio is not configured.');
  const existing = await supabase
    .from('portfolios')
    .select('id,user_id,name,base_currency,created_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing.error) throw new Error(cloudMessage(existing.error));
  if (existing.data) return existing.data as CloudPortfolioRow;

  const created = await supabase
    .from('portfolios')
    .insert({ user_id: userId, name: local.portfolio.name, base_currency: local.portfolio.base_currency })
    .select('id,user_id,name,base_currency,created_at')
    .single();
  if (!created.error && created.data) return created.data as CloudPortfolioRow;

  // A signup trigger or another tab may have created the one-per-user portfolio concurrently.
  const retry = await supabase
    .from('portfolios')
    .select('id,user_id,name,base_currency,created_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (retry.error || !retry.data) throw new Error(cloudMessage(created.error ?? retry.error));
  return retry.data as CloudPortfolioRow;
}

function toCloudTransaction(tx: Transaction, userId: string, portfolioId: string) {
  return {
    user_id: userId,
    portfolio_id: portfolioId,
    transaction_id: tx.id,
    date: tx.timestamp.slice(0, 10),
    type: tx.type,
    symbol: tx.symbol,
    quantity: tx.quantity,
    price: tx.price,
    fees: 0,
    amount: null,
    currency: tx.currency,
    executed_at: tx.timestamp,
    recorded_at: tx.created_at,
    source: 'assetmind-web',
    client_request_id: tx.client_request_id ?? null,
  };
}

function fromCloudTransaction(row: CloudTransactionRow): Transaction {
  return {
    id: row.transaction_id,
    portfolio_id: row.portfolio_id,
    symbol: row.symbol.trim().toUpperCase(),
    type: row.type,
    quantity: Number(row.quantity),
    price: Number(row.price),
    currency: row.currency,
    timestamp: row.executed_at,
    created_at: row.recorded_at ?? row.created_at ?? row.executed_at,
    ...(row.client_request_id ? { client_request_id: row.client_request_id } : {}),
  };
}

async function migrateLocalPortfolioOnce(userId: string, local: LocalPortfolio, cloudPortfolio: CloudPortfolioRow) {
  if (!supabase) return;
  const settings = await supabase
    .from('user_settings')
    .select('portfolio_migrated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (settings.error) throw new Error(cloudMessage(settings.error));
  if (settings.data?.portfolio_migrated_at) return;

  if (local.transactions.length > 0) {
    const existing = await supabase
      .from('transactions')
      .select('transaction_id')
      .eq('user_id', userId)
      .eq('portfolio_id', cloudPortfolio.id);
    if (existing.error) throw new Error(cloudMessage(existing.error));
    const cloudIds = new Set((existing.data ?? []).map((row) => String(row.transaction_id)));
    const missing = local.transactions.filter((tx) => !cloudIds.has(tx.id));
    if (missing.length) {
      const inserted = await supabase
        .from('transactions')
        .insert(missing.map((tx) => toCloudTransaction(tx, userId, cloudPortfolio.id)));
      if (inserted.error) throw new Error(cloudMessage(inserted.error));
    }
  }

  const marked = await supabase.from('user_settings').upsert(
    { user_id: userId, portfolio_migrated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (marked.error) throw new Error(cloudMessage(marked.error));
}

async function loadCloudCanonical(userId: string): Promise<LocalPortfolio> {
  if (!supabase) return readPortfolio(userId);
  const local = readPortfolio(userId);
  const cloudPortfolio = await ensureCloudPortfolio(userId, local);
  await migrateLocalPortfolioOnce(userId, local, cloudPortfolio);

  const rows = await supabase
    .from('transactions')
    .select('transaction_id,portfolio_id,type,symbol,quantity,price,currency,executed_at,recorded_at,created_at,client_request_id')
    .eq('user_id', userId)
    .eq('portfolio_id', cloudPortfolio.id)
    .in('type', ['BUY', 'SELL'])
    .order('executed_at', { ascending: true })
    .order('recorded_at', { ascending: true });
  if (rows.error) throw new Error(cloudMessage(rows.error));

  const canonical: LocalPortfolio = {
    version: 1,
    portfolio: {
      id: cloudPortfolio.id,
      name: cloudPortfolio.name,
      base_currency: cloudPortfolio.base_currency,
      created_at: cloudPortfolio.created_at,
    },
    transactions: (rows.data ?? []).map((row) => fromCloudTransaction(row as CloudTransactionRow)),
  };
  validatePortfolio(canonical);
  writePortfolio(canonical, userId, false);
  return canonical;
}

/** Cloud is canonical when configured; localStorage remains a validated read cache/offline fallback. */
export async function readPortfolioSynced(userId: string): Promise<LocalPortfolio> {
  if (!supabase) return readPortfolio(userId);
  try {
    return await loadCloudCanonical(userId);
  } catch (error) {
    console.warn('[AssetMind portfolio sync]', error);
    return readPortfolio(userId);
  }
}

function sameTransactionInput(existing: Transaction, input: NewTransaction): boolean {
  return existing.symbol === input.symbol && existing.type === input.type && existing.quantity === input.quantity && existing.price === input.price && existing.currency === input.currency && existing.timestamp === input.timestamp;
}

export async function addTransaction(input: NewTransaction, requestId: string, userId: string) {
  return withStorageLock(userId, async () => {
    const data = supabase ? await loadCloudCanonical(userId) : readPortfolio(userId);
    const existing = data.transactions.find(tx => tx.client_request_id === requestId);
    if (existing) {
      if (!sameTransactionInput(existing, input)) throw new Error('Retry ID was reused for a different transaction.');
      return existing;
    }

    const latest = data.transactions.reduce((n, tx) => Math.max(n, Date.parse(tx.created_at)), 0);
    const tx: Transaction = {
      ...input,
      id: crypto.randomUUID(),
      client_request_id: requestId,
      portfolio_id: data.portfolio.id,
      created_at: new Date(Math.max(Date.now(), latest + 1)).toISOString(),
    };
    const next = validatePortfolio({ ...data, transactions: [...data.transactions, tx] });

    if (supabase) {
      const inserted = await supabase.from('transactions').insert(toCloudTransaction(tx, userId, data.portfolio.id));
      if (inserted.error) {
        if (inserted.error.code === '23505') {
          const retry = await supabase
            .from('transactions')
            .select('transaction_id,portfolio_id,type,symbol,quantity,price,currency,executed_at,recorded_at,created_at,client_request_id')
            .eq('user_id', userId)
            .eq('portfolio_id', data.portfolio.id)
            .eq('client_request_id', requestId)
            .maybeSingle();
          if (!retry.error && retry.data) {
            const remote = fromCloudTransaction(retry.data as CloudTransactionRow);
            if (!sameTransactionInput(remote, input)) throw new Error('Retry ID was reused for a different transaction.');
            return remote;
          }
        }
        throw new Error(cloudMessage(inserted.error));
      }
    }

    writePortfolio(next, userId);
    return tx;
  });
}

export async function updateTransaction(transactionId: string, input: NewTransaction, userId: string) {
  return withStorageLock(userId, async () => {
    const data = supabase ? await loadCloudCanonical(userId) : readPortfolio(userId);
    const index = data.transactions.findIndex((tx) => tx.id === transactionId);
    if (index < 0) throw new Error('Transaction was not found. Refresh the portfolio and try again.');
    const current = data.transactions[index];
    const updated: Transaction = { ...current, ...input, portfolio_id: data.portfolio.id };
    const transactions = [...data.transactions];
    transactions[index] = updated;
    const next = validatePortfolio({ ...data, transactions });

    if (supabase) {
      const result = await supabase
        .from('transactions')
        .update({
          date: updated.timestamp.slice(0, 10),
          type: updated.type,
          symbol: updated.symbol,
          quantity: updated.quantity,
          price: updated.price,
          currency: updated.currency,
          executed_at: updated.timestamp,
        })
        .eq('user_id', userId)
        .eq('portfolio_id', data.portfolio.id)
        .eq('transaction_id', transactionId);
      if (result.error) throw new Error(cloudMessage(result.error));
    }

    writePortfolio(next, userId);
    return updated;
  });
}

export async function deleteTransaction(transactionId: string, userId: string) {
  return withStorageLock(userId, async () => {
    const data = supabase ? await loadCloudCanonical(userId) : readPortfolio(userId);
    if (!data.transactions.some((tx) => tx.id === transactionId)) throw new Error('Transaction was not found. Refresh the portfolio and try again.');
    const transactions = data.transactions.filter((tx) => tx.id !== transactionId);
    let next: LocalPortfolio;
    try {
      next = validatePortfolio({ ...data, transactions });
    } catch (error) {
      if (error instanceof Error && error.message.includes('SELL quantity')) {
        throw new Error('This transaction cannot be deleted because a later SELL would exceed the available position. Edit the dependent transactions first.');
      }
      throw error;
    }

    if (supabase) {
      const result = await supabase
        .from('transactions')
        .delete()
        .eq('user_id', userId)
        .eq('portfolio_id', data.portfolio.id)
        .eq('transaction_id', transactionId);
      if (result.error) throw new Error(cloudMessage(result.error));
    }

    writePortfolio(next, userId);
  });
}

export function exportPortfolio(userId: string) {
  const storageKey = getPortfolioStorageKey(userId);
  const raw = localStorage.getItem(storageKey) ?? JSON.stringify(readPortfolio(userId));
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'assetmind-backup.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importPortfolio(raw: string, userId: string) {
  const incoming = validatePortfolio(JSON.parse(raw));
  return withStorageLock(userId, async () => {
    const current = supabase ? await loadCloudCanonical(userId) : readPortfolio(userId);
    if (current.portfolio.base_currency !== incoming.portfolio.base_currency) throw new Error('Backup uses another base currency. Existing data was preserved.');
    if (current.transactions.length > 0 && current.portfolio.id !== incoming.portfolio.id && incoming.portfolio.id !== `local-${userId}`) {
      throw new Error('Backup belongs to another portfolio. Existing data was preserved.');
    }

    const transactions = new Map(current.transactions.map(tx => [tx.id, tx]));
    for (const source of incoming.transactions) {
      const tx = { ...source, portfolio_id: current.portfolio.id };
      const existing = transactions.get(tx.id);
      if (existing && !Object.keys(existing).every(key => existing[key as keyof Transaction] === tx[key as keyof Transaction])) {
        throw new Error('Backup conflicts with an existing transaction. Nothing was changed.');
      }
      transactions.set(tx.id, tx);
    }
    const next = validatePortfolio({ ...current, transactions: [...transactions.values()] });

    if (supabase) {
      const currentIds = new Set(current.transactions.map((tx) => tx.id));
      const missing = next.transactions.filter((tx) => !currentIds.has(tx.id));
      if (missing.length) {
        const result = await supabase.from('transactions').insert(missing.map((tx) => toCloudTransaction(tx, userId, current.portfolio.id)));
        if (result.error) throw new Error(cloudMessage(result.error));
      }
    }

    writePortfolio(next, userId);
  });
}
