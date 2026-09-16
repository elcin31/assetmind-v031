import { useEffect, useMemo, useState } from "react";
import type { HistoryBar, PortfolioSnapshot } from "../types";
import type { BenchmarkSymbol, Period } from "../types/analytics";
import { calculatePortfolioAnalytics } from "../math/analytics";
import { loadHistory } from "./historyCache";
interface HistoryResult {
  key: string;
  histories: Map<string, HistoryBar[]>;
  errors: string[];
}
export function usePortfolioAnalytics(snapshot: PortfolioSnapshot) {
  const [period, setPeriod] = useState<Period>("1Y");
  const [benchmark, setBenchmark] = useState<BenchmarkSymbol>("SPY");
  const [rf, setRf] = useState(0);
  const [mar, setMar] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const symbolsKey = [
    ...new Set([...snapshot.transactions.map((t) => t.symbol), benchmark]),
  ]
    .sort()
    .join(",");
  const key = `${symbolsKey}:${retry}`;
  useEffect(() => {
    let active = true;
    const symbols = symbolsKey.split(",").filter(Boolean);
    void Promise.allSettled(symbols.map((symbol) => loadHistory(symbol, "5y", retry > 0))).then(
      (results) => {
        const histories = new Map<string, HistoryBar[]>();
        const errors: string[] = [];
        results.forEach((r, i) => {
          if (r.status === "fulfilled") histories.set(symbols[i], r.value);
          else
            errors.push(
              `${symbols[i]}: ${r.reason instanceof Error ? r.reason.message : "история недоступна"}`,
            );
        });
        if (active) setResult({ key, histories, errors });
      },
    );
    return () => {
      active = false;
    };
  }, [key, symbolsKey, retry]);
  const current = result?.key === key ? result : null;
  const asOf = new Date().toISOString().slice(0, 10);
  const coverageNotices = current ? [...current.histories].flatMap(([symbol, bars]) => {
    const first = bars[0]?.date;
    const last = bars.at(-1)?.date;
    if (!first || !last) return [];
    const short = Date.parse(asOf) - Date.parse(first) < 4.9 * 365.25 * 86400000;
    const stale = Date.parse(asOf) - Date.parse(last) > 10 * 86400000;
    return short || stale ? [`${symbol}: ${first} — ${last}, ${bars.length} цен. Доступна только эта история; возможна недавняя дата листинга или неполный ответ поставщика.`] : [];
  }) : [];
  const analytics = useMemo(
    () =>
      calculatePortfolioAnalytics(
        snapshot,
        current?.histories ?? new Map(),
        benchmark,
        period,
        asOf,
        rf / 100,
        mar / 100,
      ),
    [snapshot, current, benchmark, period, asOf, rf, mar],
  );
  return {
    analytics,
    period,
    setPeriod,
    benchmark,
    setBenchmark,
    rf,
    setRf,
    mar,
    setMar,
    loading: !current,
    historyState: !current ? "loading" : current.errors.length ? (current.histories.size ? "partial_provider_history" : "provider_unavailable") : coverageNotices.length ? "partial_provider_history" : "ready",
    coverageNotices,
    errors: current?.errors ?? [],
    retry: () => setRetry((n) => n + 1),
  };
}
export type AnalyticsController = ReturnType<typeof usePortfolioAnalytics>;
