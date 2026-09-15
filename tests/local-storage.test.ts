import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { addTransaction, importPortfolio, readPortfolio, STORAGE_KEY } from '../src/storage/portfolio';
let values: Map<string, string>;
const buy = { symbol: 'AAPL', type: 'BUY' as const, quantity: 1, price: 100, currency: 'USD', timestamp: '2026-09-15T10:00:00Z' };
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  let pending = Promise.resolve();
  vi.stubGlobal('navigator', { locks: { request: (_key: string, fn: () => unknown) => { const result = pending.then(fn); pending = result.then(() => {}, () => {}); return result; } } });
});
afterEach(() => vi.unstubAllGlobals());
it('starts empty without configuration and persists a purchase on reload', async () => {
  expect(readPortfolio().transactions).toEqual([]);
  await addTransaction(buy, 'buy');
  expect(readPortfolio().transactions).toHaveLength(1);
});
it('deduplicates retries and rejects changed retry payloads', async () => {
  await addTransaction(buy, 'buy'); await addTransaction(buy, 'buy');
  await expect(addTransaction({ ...buy, price: 101 }, 'buy')).rejects.toThrow('Retry ID');
  expect(readPortfolio().transactions).toHaveLength(1);
});
it('rejects oversized and backdated sells without modifying storage', async () => {
  await addTransaction(buy, 'buy');
  const before = values.get(STORAGE_KEY);
  await expect(addTransaction({ ...buy, type: 'SELL', quantity: 2 }, 'sell')).rejects.toThrow('SELL quantity');
  await expect(addTransaction({ ...buy, type: 'SELL', timestamp: '2026-09-14T10:00:00Z' }, 'backdated')).rejects.toThrow('SELL quantity');
  expect(values.get(STORAGE_KEY)).toBe(before);
});
it('serializes concurrent sales so only one can spend the position', async () => {
  await addTransaction(buy, 'buy');
  const results = await Promise.allSettled(['a', 'b'].map(id => addTransaction({ ...buy, type: 'SELL' }, id)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(readPortfolio().transactions).toHaveLength(2);
});
it('merges backups without duplicates and preserves data after invalid import', async () => {
  await addTransaction(buy, 'buy'); const raw = values.get(STORAGE_KEY)!;
  await importPortfolio(raw); expect(readPortfolio().transactions).toHaveLength(1);
  await expect(importPortfolio('{"version":99}')).rejects.toThrow();
  expect(values.get(STORAGE_KEY)).toBe(raw);
  values.clear(); await importPortfolio(raw); expect(readPortfolio().transactions).toHaveLength(1);
});
it('does not overwrite damaged data or report success on quota errors', async () => {
  values.set(STORAGE_KEY, 'broken');
  await expect(addTransaction(buy, 'buy')).rejects.toThrow('damaged');
  expect(values.get(STORAGE_KEY)).toBe('broken');
  values.clear(); vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
  await expect(addTransaction(buy, 'buy')).rejects.toThrow('could not be saved');
});
