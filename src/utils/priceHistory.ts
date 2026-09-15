import type { HistoryBar } from '../types';

/** Discard invalid provider points, deduplicate days and sort chronologically. */
export function normalizePriceHistory(value: unknown): HistoryBar[] {
  if (!Array.isArray(value)) return [];
  const days = new Map<string, HistoryBar>();
  for (const item of value) {
    if (!item || typeof item.date !== 'string' || !Number.isFinite(Date.parse(item.date)) ||
        typeof item.close !== 'number' || !Number.isFinite(item.close) || item.close <= 0) continue;
    const date = new Date(item.date).toISOString().slice(0, 10);
    days.set(date, { date, close: item.close });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function chartGeometry(bars: HistoryBar[]) {
  if (!bars.length) return { points: [], min: 0, max: 0 };
  const prices = bars.map(bar => bar.close);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const padding = (high - low || high * 0.02) * 0.12;
  const min = low - padding;
  const max = high + padding;
  const start = Date.parse(bars[0].date);
  const span = Date.parse(bars[bars.length - 1].date) - start;
  const points = bars.map(bar => ({
    x: span ? 16 + (Date.parse(bar.date) - start) / span * 568 : 300,
    y: 16 + (max - bar.close) / (max - min) * 188,
  }));
  return { points, min, max };
}
