import type { HistoryBar } from "../types";
import { normalizePriceHistory } from "../utils/priceHistory";
type Entry = { expires: number; promise: Promise<HistoryBar[]> };
const cache = new Map<string, Entry>();
/** Public market data only. Pending requests are shared; errors are evicted for retry. */
export function loadHistory(
  symbol: string,
  period = "5y",
): Promise<HistoryBar[]> {
  const key = `${symbol}:${period}`;
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.promise;
  const promise = (async () => {
    const response = await fetch(
      `/api/history?symbol=${encodeURIComponent(symbol)}&period=${period}`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!response.ok)
      throw new Error(
        response.status === 404
          ? "Нет истории у поставщика"
          : "Ошибка поставщика истории",
      );
    const data = await response.json();
    if (data.symbol !== symbol || data.period !== period)
      throw new Error("История другого актива или периода");
    const bars = normalizePriceHistory(data.bars);
    if (!bars.length) throw new Error("Недостаточно истории");
    return bars;
  })();
  cache.set(key, { expires: Date.now() + 300000, promise });
  void promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return promise;
}
