import type { Portfolio, Transaction } from '../types';
import { calculatePositions } from '../math/positions';

export const LEGACY_STORAGE_KEY = 'assetmind.portfolio.v1';
export interface LocalPortfolio { version: 1; portfolio: Portfolio; transactions: Transaction[] }
export type NewTransaction = Pick<Transaction, 'symbol' | 'type' | 'quantity' | 'price' | 'currency' | 'timestamp'>;
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

function writePortfolio(data: LocalPortfolio, userId: string) {
  validatePortfolio(data);
  const storageKey = getPortfolioStorageKey(userId);
  try { localStorage.setItem(storageKey, JSON.stringify(data)); }
  catch { throw new Error('Portfolio could not be saved. Browser storage is full or blocked. Export a backup and free space.'); }
  window.dispatchEvent(new Event('assetmind:changed'));
}

async function withStorageLock<T>(userId: string, action: () => T): Promise<T> {
  if (!navigator.locks) throw new Error('Please use an up-to-date browser with Web Locks support to save safely.');
  return navigator.locks.request(getPortfolioStorageKey(userId), action);
}

export async function addTransaction(input: NewTransaction, requestId: string, userId: string) {
  return withStorageLock(userId, () => {
    const data = readPortfolio(userId);
    const existing = data.transactions.find(tx => tx.client_request_id === requestId);
    if (existing) {
      if (!Object.entries(input).every(([key, value]) => existing[key as keyof Transaction] === value)) throw new Error('Retry ID was reused for a different transaction.');
      return existing;
    }
    const latest = data.transactions.reduce((n, tx) => Math.max(n, Date.parse(tx.created_at)), 0);
    const tx: Transaction = { ...input, id: crypto.randomUUID(), client_request_id: requestId, portfolio_id: data.portfolio.id, created_at: new Date(Math.max(Date.now(), latest + 1)).toISOString() };
    writePortfolio({ ...data, transactions: [...data.transactions, tx] }, userId);
    return tx;
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
  return withStorageLock(userId, () => {
    const current = readPortfolio(userId);
    if (current.transactions.length === 0) { writePortfolio(incoming, userId); return; }
    if (current.portfolio.id !== incoming.portfolio.id || current.portfolio.base_currency !== incoming.portfolio.base_currency) throw new Error('Backup belongs to another portfolio. Existing data was preserved.');
    const transactions = new Map(current.transactions.map(tx => [tx.id, tx]));
    for (const tx of incoming.transactions) {
      const existing = transactions.get(tx.id);
      if (existing && !Object.keys(existing).every(key => existing[key as keyof Transaction] === tx[key as keyof Transaction])) throw new Error('Backup conflicts with an existing transaction. Nothing was changed.');
      transactions.set(tx.id, tx);
    }
    writePortfolio({ ...current, transactions: [...transactions.values()] }, userId);
  });
}
