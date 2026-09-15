import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { addTransaction, getPortfolioStorageKey, importPortfolio, LEGACY_STORAGE_KEY, readPortfolio } from '../src/storage/portfolio';

let values: Map<string, string>;
const userA = 'user-a';
const userB = 'user-b';
const buy = { symbol: 'AAPL', type: 'BUY' as const, quantity: 1, price: 100, currency: 'USD', timestamp: '2026-09-15T10:00:00Z' };

beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  let pending = Promise.resolve();
  vi.stubGlobal('navigator', { locks: { request: (_key: string, fn: () => unknown) => { const result = pending.then(fn); pending = result.then(() => {}, () => {}); return result; } } });
});

afterEach(() => vi.unstubAllGlobals());

it('starts empty without configuration and persists a purchase on reload', async () => {
  expect(readPortfolio(userA).transactions).toEqual([]);
  await addTransaction(buy, 'buy', userA);
  expect(readPortfolio(userA).transactions).toHaveLength(1);
});

it('deduplicates retries and rejects changed retry payloads', async () => {
  await addTransaction(buy, 'buy', userA); await addTransaction(buy, 'buy', userA);
  await expect(addTransaction({ ...buy, price: 101 }, 'buy', userA)).rejects.toThrow('Retry ID');
  expect(readPortfolio(userA).transactions).toHaveLength(1);
});

it('rejects oversized and backdated sells without modifying storage', async () => {
  const storageKey = getPortfolioStorageKey(userA);
  await addTransaction(buy, 'buy', userA);
  const before = values.get(storageKey);
  await expect(addTransaction({ ...buy, type: 'SELL', quantity: 2 }, 'sell', userA)).rejects.toThrow('SELL quantity');
  await expect(addTransaction({ ...buy, type: 'SELL', timestamp: '2026-09-14T10:00:00Z' }, 'backdated', userA)).rejects.toThrow('SELL quantity');
  expect(values.get(storageKey)).toBe(before);
});

it('serializes concurrent sales so only one can spend the position', async () => {
  await addTransaction(buy, 'buy', userA);
  const results = await Promise.allSettled(['a', 'b'].map(id => addTransaction({ ...buy, type: 'SELL' }, id, userA)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(readPortfolio(userA).transactions).toHaveLength(2);
});

it('merges backups without duplicates and preserves data after invalid import', async () => {
  const storageKey = getPortfolioStorageKey(userA);
  await addTransaction(buy, 'buy', userA); const raw = values.get(storageKey)!;
  await importPortfolio(raw, userA); expect(readPortfolio(userA).transactions).toHaveLength(1);
  await expect(importPortfolio('{"version":99}', userA)).rejects.toThrow();
  expect(values.get(storageKey)).toBe(raw);
  values.clear(); await importPortfolio(raw, userA); expect(readPortfolio(userA).transactions).toHaveLength(1);
});

it('isolates portfolio data between authenticated users in the same browser', async () => {
  await addTransaction(buy, 'buy-a', userA);
  expect(readPortfolio(userA).transactions).toHaveLength(1);
  expect(readPortfolio(userB).transactions).toHaveLength(0);

  await addTransaction({ ...buy, symbol: 'MSFT' }, 'buy-b', userB);
  expect(readPortfolio(userA).transactions.map(tx => tx.symbol)).toEqual(['AAPL']);
  expect(readPortfolio(userB).transactions.map(tx => tx.symbol)).toEqual(['MSFT']);
  expect(getPortfolioStorageKey(userA)).not.toBe(getPortfolioStorageKey(userB));
});

it('migrates the old anonymous portfolio once and does not expose it to the next user', async () => {
  const storageKey = getPortfolioStorageKey(userA);
  await addTransaction(buy, 'buy', userA);
  const legacyRaw = values.get(storageKey)!;
  values.delete(storageKey);
  values.set(LEGACY_STORAGE_KEY, legacyRaw);

  expect(readPortfolio(userA).transactions).toHaveLength(1);
  expect(values.get(LEGACY_STORAGE_KEY)).toBeUndefined();
  expect(values.get(storageKey)).toBe(legacyRaw);
  expect(readPortfolio(userB).transactions).toHaveLength(0);
});

it('does not overwrite damaged data or report success on quota errors', async () => {
  const storageKey = getPortfolioStorageKey(userA);
  values.set(storageKey, 'broken');
  await expect(addTransaction(buy, 'buy', userA)).rejects.toThrow('damaged');
  expect(values.get(storageKey)).toBe('broken');
  values.clear();
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => { throw new Error('quota'); },
    removeItem: vi.fn(),
  });
  await expect(addTransaction(buy, 'buy', userA)).rejects.toThrow('could not be saved');
});
