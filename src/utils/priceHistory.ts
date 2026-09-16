import type { HistoryBar } from '../types/index.js';

function validIsoDay(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
  );
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Normalize provider history at the application boundary.
 * Rules: ISO UTC days only, finite positive closes, no future observations,
 * ascending order and one observation per day. Duplicate days resolve to the
 * last valid provider observation deterministically; no filling is performed.
 */
export function normalizePriceHistory(value: unknown, asOf: string = utcToday()): HistoryBar[] {
  if (!Array.isArray(value) || !validIsoDay(asOf)) return [];
  const days = new Map<string, HistoryBar>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || !('date' in item) || !('close' in item) || typeof item.date !== 'string' || !validIsoDay(item.date) || item.date > asOf || typeof item.close !== 'number' || !Number.isFinite(item.close) || item.close <= 0) continue;
    days.set(item.date, { date: item.date, close: item.close });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function chartGeometry(bars: HistoryBar[]) {
  if (!bars.length) return { points: [], min: 0, max: 0 };
  const prices = bars.map((bar) => bar.close);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const padding = (high - low || high * 0.02) * 0.12;
  const min = low - padding;
  const max = high + padding;
  const start = Date.parse(bars[0].date);
  const span = Date.parse(bars[bars.length - 1].date) - start;
  const points = bars.map((bar) => ({
    x: span ? 16 + ((Date.parse(bar.date) - start) / span) * 568 : 300,
    y: 16 + ((max - bar.close) / (max - min)) * 188,
  }));
  return { points, min, max };
}
