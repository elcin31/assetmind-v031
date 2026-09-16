import type { HistoryBar } from '../src/types';
import { normalizePriceHistory } from '../src/utils/priceHistory.js';

export type HistoryPeriod = '1m' | '3m' | '6m' | '1y' | '2y' | '5y';
export type HistoryFailureCode = 'authorization' | 'plan_restriction' | 'rate_limit' | 'provider_unavailable' | 'timeout' | 'malformed_response' | 'empty_history' | 'not_configured';
export interface ProviderFailure {
  provider: string;
  code: HistoryFailureCode;
  status: number | null;
}
export class HistoryProviderError extends Error {
  readonly failures: ProviderFailure[];
  constructor(failures: ProviderFailure[]) {
    super(failures.map(f => `${f.provider}: ${f.code}${f.status ? ` (HTTP ${f.status})` : ''}`).join('; '));
    this.name = 'HistoryProviderError';
    this.failures = failures;
  }
}
export interface HistoryResult {
  bars: HistoryBar[];
  provider: 'finnhub' | 'yahoo';
  priceBasis: 'split-adjusted-close';
  warnings: ProviderFailure[];
}
function fail(provider: string, code: HistoryFailureCode, status: number | null = null): never {
  throw new HistoryProviderError([{ provider, code, status }]);
}
async function json(url: string, provider: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'AssetMind/0.1', Accept: 'application/json' } });
    if (!response.ok) {
      const code = response.status === 401 ? 'authorization' : response.status === 403 ? 'plan_restriction' : response.status === 429 ? 'rate_limit' : 'provider_unavailable';
      fail(provider, code, response.status);
    }
    try { return await response.json(); }
    catch { fail(provider, 'malformed_response'); }
  } catch (error) {
    if (error instanceof HistoryProviderError) throw error;
    fail(provider, controller.signal.aborted ? 'timeout' : 'provider_unavailable');
  } finally { clearTimeout(timer); }
}
export function historyStart(period: HistoryPeriod, now = new Date()): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, '2y': 24, '5y': 60 }[period];
  start.setUTCMonth(start.getUTCMonth() - months);
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(now.getUTCDate(), last));
  return start;
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function first(value: unknown): unknown { return Array.isArray(value) ? value[0] : undefined; }
function barsFromArrays(timestamps: unknown, closes: unknown, provider: string, start: string, end: string): HistoryBar[] {
  if (!Array.isArray(timestamps) || !Array.isArray(closes) || timestamps.length !== closes.length)
    fail(provider, 'malformed_response');
  const input = timestamps.flatMap((t, i) => {
    if (typeof t !== 'number' || !Number.isFinite(t) || Math.abs(t * 1000) > 8640000000000000) return [];
    return [{ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] }];
  });
  const bars = normalizePriceHistory(input, end).filter(b => b.date >= start);
  if (!bars.length) fail(provider, timestamps.length ? 'malformed_response' : 'empty_history');
  return bars;
}
/** Both providers use split-adjusted close, excluding dividend reinvestment. Never mix Yahoo adjclose with Finnhub close. */
export async function fetchHistory(symbol: string, period: HistoryPeriod, now = new Date()): Promise<HistoryResult> {
  const sym = symbol.trim().toUpperCase();
  const start = historyStart(period, now);
  const from = Math.floor(start.getTime() / 1000);
  const to = Math.floor(now.getTime() / 1000);
  const startDay = start.toISOString().slice(0, 10);
  const endDay = now.toISOString().slice(0, 10);
  const warnings: ProviderFailure[] = [];
  try {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) fail('finnhub', 'not_configured');
    const data = record(await json(`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=D&from=${from}&to=${to}&token=${encodeURIComponent(key)}`, 'finnhub'));
    if (data.s === 'no_data') fail('finnhub', 'empty_history');
    if (data.s !== 'ok') fail('finnhub', 'malformed_response');
    return { bars: barsFromArrays(data.t, data.c, 'finnhub', startDay, endDay), provider: 'finnhub', priceBasis: 'split-adjusted-close', warnings };
  } catch (error) {
    if (!(error instanceof HistoryProviderError)) throw error;
    warnings.push(...error.failures);
  }
  try {
    const data = record(await json(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${from}&period2=${to}&interval=1d&events=history&includeAdjustedClose=true`, 'yahoo'));
    const chart = record(data.chart);
    if (chart.error) fail('yahoo', 'provider_unavailable');
    const result = record(first(chart.result));
    const quotes = record(first(record(result.indicators).quote));
    return { bars: barsFromArrays(result.timestamp, quotes.close, 'yahoo', startDay, endDay), provider: 'yahoo', priceBasis: 'split-adjusted-close', warnings };
  } catch (error) {
    if (!(error instanceof HistoryProviderError)) throw error;
    throw new HistoryProviderError([...warnings, ...error.failures]);
  }
}
