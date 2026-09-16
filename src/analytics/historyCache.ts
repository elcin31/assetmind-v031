import type { HistoryBar } from "../types";
import { normalizePriceHistory } from "../utils/priceHistory";
type Entry = { expires: number; promise: Promise<HistoryBar[]>; pending: boolean };
const cache = new Map<string, Entry>();
/** Public market data only. Pending requests are shared; errors are evicted for retry. */
export function loadHistory(
  symbol: string,
  period = "5y",
  refresh = false,
): Promise<HistoryBar[]> {
  symbol = symbol.trim().toUpperCase();
  const key = `${symbol}:${period}`;
  const pending = cache.get(key);
  if (pending?.pending) return pending.promise;
  if (refresh) cache.delete(key);
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.promise;
  const promise = (async () => {
    const response = await fetch(
      `/api/history?symbol=${encodeURIComponent(symbol)}&period=${period}${refresh ? "&refresh=1" : ""}`,
      { signal: AbortSignal.timeout(20000), cache: "no-store" },
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(`История недоступна: HTTP ${response.status}${typeof data.error === "string" ? ` · ${data.error}` : ""}`);
    }
    const data = await response.json();
    if (data.symbol !== symbol || data.period !== period)
      throw new Error("История другого актива или периода");
    const bars = normalizePriceHistory(data.bars);
    if (!bars.length) throw new Error("Недостаточно истории");
    return bars;
  })();
  cache.set(key, { expires: Date.now() + 300000, promise, pending: true });
  void promise.then(() => {
    const entry = cache.get(key);
    if (entry?.promise === promise) entry.pending = false;
  }, () => {});
  void promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return promise;
}
