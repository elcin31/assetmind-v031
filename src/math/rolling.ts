import type { DatedReturn } from '../types/analytics';
import { sharpeRatio } from './ratios';
import { MIN_OBSERVATIONS, validDate, volatility } from './statistics';
export function rollingMetric(returns: DatedReturn[], window: number, metric: 'volatility' | 'sharpe', rf = 0): { date: string; value: number | null }[] {
  if (!Number.isInteger(window) || window < MIN_OBSERVATIONS || returns.some((r, i) => !validDate(r.date) || !validDate(r.startDate) || r.startDate >= r.date || !Number.isFinite(r.value) || r.value < -1 || (i > 0 && r.startDate !== returns[i - 1].date))) return [];
  return returns.map((r, i) => ({ date: r.date, value: i < window - 1 ? null : metric === 'volatility' ? volatility(returns.slice(i - window + 1, i + 1).map(p => p.value)) : sharpeRatio(returns.slice(i - window + 1, i + 1).map(p => p.value), rf) }));
}
