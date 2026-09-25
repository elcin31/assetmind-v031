import { datedReturns } from '../math/performance';
import { useEffect, useMemo, useState } from 'react';
import type { HistoryBar, PortfolioSnapshot, StockSplit } from '../types';
import type { BenchmarkSymbol, Period, RiskHorizon } from '../types/analytics';
import { calculatePortfolioAnalytics } from '../math/analytics';
import { buildCorrelationExplorer } from '../math/correlationExplorer';
import {
  clearHistoryCache,
  HistoryRequestError,
  loadHistoricalMarketData,
  type HistoryRequestIssue,
} from './historyCache';
import {
  loadAnalyticsPreferences,
  readLocalAnalyticsPreferences,
  saveAnalyticsPreferences,
} from './preferences';

interface HistoryResult {
  key: string;
  /** Adjusted-close series for return/risk analytics. */
  histories: Map<string, HistoryBar[]>;
  /** Raw-close series for actual historical account valuation. */
  valuationHistories: Map<string, HistoryBar[]>;
  splits: Map<string, StockSplit[]>;
  /** First actually observed raw valuation bar for each symbol. */
  coverageStarts: Map<string, string>;
  errors: string[];
  issues: HistoryRequestIssue[];
}

export function usePortfolioAnalytics(snapshot: PortfolioSnapshot, userId?: string) {
  const initial = userId ? readLocalAnalyticsPreferences(userId) : { period: '1Y' as Period, riskHorizon: '20D' as RiskHorizon, benchmark: 'SPY' as BenchmarkSymbol, rf: 0, mar: 0 };
  const [period, setPeriod] = useState<Period>(initial.period);
  const [riskHorizon, setRiskHorizon] = useState<RiskHorizon>(initial.riskHorizon);
  const [benchmark, setBenchmark] = useState<BenchmarkSymbol>(initial.benchmark);
  const [rf, setRf] = useState(initial.rf);
  const [mar, setMar] = useState(initial.mar);
  const [selectedCorrelationAsset, setSelectedCorrelationAsset] = useState(snapshot.positions[0]?.symbol ?? '');
  const [preferencesReady, setPreferencesReady] = useState(!userId);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<HistoryResult | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void loadAnalyticsPreferences(userId).then((preferences) => {
      if (!active) return;
      setPeriod(preferences.period);
      setRiskHorizon(preferences.riskHorizon);
      setBenchmark(preferences.benchmark);
      setRf(preferences.rf);
      setMar(preferences.mar);
      setPreferencesReady(true);
    });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId || !preferencesReady) return;
    const timer = window.setTimeout(() => {
      void saveAnalyticsPreferences(userId, { period, riskHorizon, benchmark, rf, mar });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [userId, preferencesReady, period, riskHorizon, benchmark, rf, mar]);

  const activeCorrelationAsset = snapshot.positions.some(position => position.symbol === selectedCorrelationAsset)
    ? selectedCorrelationAsset
    : snapshot.positions[0]?.symbol ?? '';

  const symbolsKey = [
    ...new Set([
      ...snapshot.transactions.map((t) => t.symbol.trim().toUpperCase()),
      benchmark,
    ]),
  ]
    .sort()
    .join(',');
  const key = `${symbolsKey}:${retry}`;

  useEffect(() => {
    let active = true;
    const symbols = symbolsKey.split(',').filter(Boolean);
    void Promise.allSettled(symbols.map((symbol) => loadHistoricalMarketData(symbol))).then(
      (results) => {
        const histories = new Map<string, HistoryBar[]>();
        const valuationHistories = new Map<string, HistoryBar[]>();
        const splits = new Map<string, StockSplit[]>();
        const coverageStarts = new Map<string, string>();
        const errors: string[] = [];
        const issues: HistoryRequestIssue[] = [];
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            histories.set(symbols[i], r.value.bars);
            valuationHistories.set(symbols[i], r.value.valuationBars);
            splits.set(symbols[i], r.value.splits);
            const firstRawBar = r.value.valuationBars[0]?.date;
            if (firstRawBar) coverageStarts.set(symbols[i], firstRawBar);
            return;
          }
          if (r.reason instanceof HistoryRequestError) {
            errors.push(r.reason.message);
            issues.push(r.reason.issue);
          } else {
            errors.push(
              `${symbols[i]}: ${r.reason instanceof Error ? r.reason.message : 'история недоступна'}`,
            );
          }
        });
        if (active) setResult({ key, histories, valuationHistories, splits, coverageStarts, errors, issues });
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
        riskHorizon,
        asOf,
        rf / 100,
        mar / 100,
        current
          ? {
              valuationHistories: current.valuationHistories,
              splits: current.splits,
              coverageStarts: current.coverageStarts,
            }
          : undefined,
      ),
    [snapshot, current, benchmark, period, riskHorizon, asOf, rf, mar],
  );

  const correlationExplorer = useMemo(
    () => buildCorrelationExplorer(activeCorrelationAsset, analytics.matrix, current?.histories ?? new Map(), benchmark, riskHorizon),
    [activeCorrelationAsset, analytics.matrix, current, benchmark, riskHorizon],
  );

  const benchmarkRiskReturns = useMemo(
    () =>
      datedReturns(
        (current?.histories.get(benchmark) ?? []).filter(
          bar => bar.date <= asOf,
        ),
      ),
    [current, benchmark, asOf],
  );

  return {
    benchmarkRiskReturns,
    analytics,
    period,
    setPeriod,
    riskHorizon,
    setRiskHorizon,
    benchmark,
    setBenchmark,
    rf,
    setRf,
    mar,
    setMar,
    selectedCorrelationAsset: activeCorrelationAsset,
    setSelectedCorrelationAsset,
    correlationExplorer,
    loading: !current,
    errors: current?.errors ?? [],
    issues: current?.issues ?? [],
    retry: () => {
      for (const symbol of symbolsKey.split(',').filter(Boolean)) clearHistoryCache(symbol);
      setRetry((n) => n + 1);
    },
  };
}

export type AnalyticsController = ReturnType<typeof usePortfolioAnalytics>;
