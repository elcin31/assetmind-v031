import type { HistoryBar } from '../types';
import type { CorrelationMatrix, RiskHorizon } from '../types/analytics';
import { datedReturns } from './performance';
import { alignReturns } from './returnAlignment';
import { correlation } from './correlation';
import { rollingPairMetric } from './rolling';
import { resolveRiskHorizon } from './riskHorizon';

export interface CorrelationExplorerRow {
  symbol: string;
  value: number | null;
  observations: number;
  rolling: Record<20 | 60 | 252, { date: string; value: number | null; observations: number }[]>;
}

/** Derived analytics for one selected holding, using the current horizon matrix. */
export function buildCorrelationExplorer(
  selectedSymbol: string,
  matrix: CorrelationMatrix | null,
  histories: Map<string, HistoryBar[]>,
  benchmarkSymbol: string,
  horizon: RiskHorizon,
): { rows: CorrelationExplorerRow[]; benchmark: CorrelationExplorerRow | null; highest: CorrelationExplorerRow | null; lowest: CorrelationExplorerRow | null } {
  const selectedIndex = matrix?.symbols.indexOf(selectedSymbol) ?? -1;
  if (!matrix || selectedIndex < 0) return { rows: [], benchmark: null, highest: null, lowest: null };
  const selectedReturns = datedReturns(histories.get(selectedSymbol) ?? []);
  const rows = matrix.symbols.flatMap((symbol, index) => {
    if (symbol === selectedSymbol) return [];
    const otherReturns = datedReturns(histories.get(symbol) ?? []);
    const a = matrix.symbols.indexOf(selectedSymbol);
    const b = index;
    return [{
      symbol,
      value: matrix.correlation[a]?.[b] ?? null,
      observations: matrix.observations,
      rolling: Object.fromEntries(([20, 60, 252] as const).map(window => [window, rollingPairMetric(selectedReturns, otherReturns, window, 'correlation')])) as CorrelationExplorerRow['rolling'],
    }];
  }).sort((a, b) => {
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return Math.abs(b.value) - Math.abs(a.value);
  });
  const benchmarkReturns = datedReturns(histories.get(benchmarkSymbol) ?? []);
  const aligned = alignReturns(selectedReturns, benchmarkReturns);
  const required = resolveRiskHorizon(horizon).intervals;
  const recent = aligned.slice(-required);
  const selectedRecent = recent.map(r => ({ date: r.date, startDate: r.startDate, value: r.portfolio }));
  const benchmarkRecent = recent.map(r => ({ date: r.date, startDate: r.startDate, value: r.benchmark }));
  const benchmark = {
    symbol: benchmarkSymbol,
    value: recent.length >= 20 ? correlation(selectedRecent.map(r => r.value), benchmarkRecent.map(r => r.value)) : null,
    observations: recent.length,
    rolling: Object.fromEntries(([20, 60, 252] as const).map(window => [window, rollingPairMetric(selectedReturns, benchmarkReturns, window, 'correlation')])) as CorrelationExplorerRow['rolling'],
  };
  const orderedValues = rows.filter(row => row.value !== null).sort((a, b) => a.value! - b.value!);
  return { rows, benchmark, highest: orderedValues.at(-1) ?? null, lowest: orderedValues[0] ?? null };
}
