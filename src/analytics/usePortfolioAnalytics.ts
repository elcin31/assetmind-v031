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
    void Promise.allSettled(symbols.map((symbol) => loadHistory(symbol))).then(
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
  }, [key, symbolsKey]);
  const current = result?.key === key ? result : null;
  const asOf = new Date().toISOString().slice(0, 10);
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
    errors: current?.errors ?? [],
    retry: () => setRetry((n) => n + 1),
  };
}
export type AnalyticsController = ReturnType<typeof usePortfolioAnalytics>;
