/**
 * Server-only market data abstraction.
 *
 * Quote/search remain on Finnhub. Historical analytics use Yahoo adjusted close
 * for return/risk calculations. The same Yahoo response also exposes raw close
 * for actual account valuation and split events for correctness checks.
 */

import { searchInstruments as fallbackSearch } from '../src/data/instruments.js';
import type { HistoryBar, Quote, SearchResult, StockSplit } from '../src/types/index.js';
import { normalizePriceHistory } from '../src/utils/priceHistory.js';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const PROVIDER_TIMEOUT_MS = 8_000;
const HISTORY_TTL_MS = 15 * 60_000;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const searchCache = new Map<string, CacheEntry<SearchResult[]>>();
const quoteCache = new Map<string, CacheEntry<Quote | null>>();
const historyCache = new Map<string, CacheEntry<HistoryResult>>();

export type HistoryPeriod = '1m' | '3m' | '6m' | '1y' | '2y' | '5y';
export type HistoryProvider = 'finnhub' | 'yahoo';
export type HistoryPriceType = 'close' | 'adjusted';
export type MarketDataErrorCode =
  | 'PROVIDER_AUTHENTICATION'
  | 'PROVIDER_FORBIDDEN'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_HTTP'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_MALFORMED_RESPONSE'
  | 'PROVIDER_EMPTY_HISTORY'
  | 'SYMBOL_NOT_FOUND';

export interface ProviderFailure {
  provider: HistoryProvider;
  code: MarketDataErrorCode;
  upstreamStatus: number | null;
  retryable: boolean;
  message: string;
}

export interface HistoryResult {
  /** Adjusted close. Use for returns, volatility, covariance and benchmark analytics. */
  bars: HistoryBar[];
  /** Raw exchange close. Use for actual historical account valuation only. */
  valuationBars: HistoryBar[];
  /** Split events are surfaced so callers never silently mis-value transaction inventory. */
  splits: StockSplit[];
  provider: HistoryProvider;
  priceType: HistoryPriceType;
  valuationPriceType: 'close' | null;
}

export class MarketDataProviderError extends Error {
  readonly provider: HistoryProvider;
  readonly code: MarketDataErrorCode;
  readonly upstreamStatus: number | null;
  readonly retryable: boolean;

  constructor(
    provider: HistoryProvider,
    code: MarketDataErrorCode,
    message: string,
    options: { upstreamStatus?: number | null; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'MarketDataProviderError';
    this.provider = provider;
    this.code = code;
    this.upstreamStatus = options.upstreamStatus ?? null;
    this.retryable = options.retryable ?? false;
  }
}

export function providerFailure(error: unknown): ProviderFailure | null {
  if (!(error instanceof MarketDataProviderError)) return null;
  return {
    provider: error.provider,
    code: error.code,
    upstreamStatus: error.upstreamStatus,
    retryable: error.retryable,
    message: error.message,
  };
}

function getApiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error('FINNHUB_API_KEY is not configured');
  return key;
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AssetMind/0.1 historical-market-data' },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function search(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = q.toUpperCase();
  const cached = readCache(searchCache, cacheKey);
  if (cached !== undefined) return cached;

  try {
    const key = getApiKey();
    const url = `${FINNHUB_BASE}/search?q=${encodeURIComponent(q)}&token=${key}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Finnhub search HTTP ${res.status}`);

    const data = (await res.json()) as {
      result?: Array<{ symbol: string; description: string; type: string; displaySymbol?: string }>;
    };
    if (!Array.isArray(data.result)) return writeCache(searchCache, cacheKey, fallbackSearch(q), 30_000);

    const unique = new Map<string, SearchResult>();
    for (const result of data.result) {
      const symbol = result.symbol?.trim().toUpperCase();
      if (!symbol || !result.description || unique.has(symbol)) continue;
      unique.set(symbol, { symbol, name: result.description, exchange: '', country: '' });
      if (unique.size >= 20) break;
    }

    const normalized = [...unique.values()];
    return writeCache(searchCache, cacheKey, normalized.length > 0 ? normalized : fallbackSearch(q), 60_000);
  } catch {
    return writeCache(searchCache, cacheKey, fallbackSearch(q), 15_000);
  }
}

export async function quote(symbol: string): Promise<Quote | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  const cached = readCache(quoteCache, sym);
  if (cached !== undefined) return cached;

  const key = getApiKey();
  try {
    const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(sym)}&token=${key}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return writeCache(quoteCache, sym, null, 5_000);

    const data = (await res.json()) as { c?: number; d?: number; dp?: number; t?: number };
    const price = finiteNumber(data.c);
    if (price === null || price <= 0) {
      return writeCache(quoteCache, sym, null, 5_000);
    }

    const timestamp = finiteNumber(data.t);
    return writeCache(quoteCache, sym, {
      symbol: sym,
      price,
      change: finiteNumber(data.d),
      changePercent: finiteNumber(data.dp),
      timestamp: timestamp !== null && timestamp > 0 ? timestamp : null,
    }, 15_000);
  } catch {
    return writeCache(quoteCache, sym, null, 5_000);
  }
}

function utcDayStart(value = Date.now()): Date {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function historyBounds(period: HistoryPeriod, now = Date.now()) {
  const endExclusive = utcDayStart(now);
  const start = new Date(endExclusive);
  switch (period) {
    case '1m': start.setUTCMonth(start.getUTCMonth() - 1); break;
    case '3m': start.setUTCMonth(start.getUTCMonth() - 3); break;
    case '6m': start.setUTCMonth(start.getUTCMonth() - 6); break;
    case '1y': start.setUTCFullYear(start.getUTCFullYear() - 1); break;
    case '2y': start.setUTCFullYear(start.getUTCFullYear() - 2); break;
    case '5y': start.setUTCFullYear(start.getUTCFullYear() - 5); break;
  }
  return {
    fromSeconds: Math.floor(start.getTime() / 1000),
    toExclusiveSeconds: Math.floor(endExclusive.getTime() / 1000),
    lastAllowedDate: new Date(endExclusive.getTime() - 1).toISOString().slice(0, 10),
  };
}

function providerHttpError(provider: HistoryProvider, status: number, detail?: string): MarketDataProviderError {
  const suffix = detail ? `: ${detail.slice(0, 160)}` : '';
  if (status === 401) return new MarketDataProviderError(provider, 'PROVIDER_AUTHENTICATION', `${provider} authentication failed${suffix}`, { upstreamStatus: status, retryable: false });
  if (status === 403) return new MarketDataProviderError(provider, 'PROVIDER_FORBIDDEN', `${provider} denied historical data access${suffix}`, { upstreamStatus: status, retryable: false });
  if (status === 429) return new MarketDataProviderError(provider, 'PROVIDER_RATE_LIMIT', `${provider} historical data rate limit reached${suffix}`, { upstreamStatus: status, retryable: true });
  return new MarketDataProviderError(provider, 'PROVIDER_HTTP', `${provider} historical data HTTP ${status}${suffix}`, { upstreamStatus: status, retryable: status >= 500 });
}

async function safeResponseText(response: Response): Promise<string> {
  try { return await response.text(); } catch { return ''; }
}

function normalizeSplits(
  value: Record<string, { date?: number; numerator?: number; denominator?: number; splitRatio?: string }> | undefined,
  lastAllowedDate: string,
): StockSplit[] {
  if (!value) return [];
  const splits: StockSplit[] = [];
  for (const event of Object.values(value)) {
    const epoch = finiteNumber(event.date);
    const numerator = finiteNumber(event.numerator);
    const denominator = finiteNumber(event.denominator);
    if (epoch === null || numerator === null || denominator === null || numerator <= 0 || denominator <= 0) continue;
    const dateObject = new Date(epoch * 1000);
    if (!Number.isFinite(dateObject.getTime())) continue;
    const date = dateObject.toISOString().slice(0, 10);
    if (date > lastAllowedDate) continue;
    const ratio = numerator / denominator;
    if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 1e-12) continue;
    splits.push({
      date,
      timestamp: dateObject.toISOString(),
      numerator,
      denominator,
      ratio,
    });
  }
  return splits.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

async function yahooHistory(symbol: string, period: HistoryPeriod): Promise<HistoryResult> {
  const bounds = historyBounds(period);
  const params = new URLSearchParams({
    period1: String(bounds.fromSeconds),
    period2: String(bounds.toExclusiveSeconds),
    interval: '1d',
    events: 'div,splits',
    includeAdjustedClose: 'true',
  });
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?${params}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(url);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MarketDataProviderError('yahoo', 'PROVIDER_TIMEOUT', 'Yahoo historical data request timed out', { retryable: true });
    }
    throw new MarketDataProviderError('yahoo', 'PROVIDER_HTTP', 'Yahoo historical data request failed', { retryable: true });
  }

  if (!response.ok) throw providerHttpError('yahoo', response.status, await safeResponseText(response));

  let payload: unknown;
  try { payload = await response.json(); }
  catch {
    throw new MarketDataProviderError('yahoo', 'PROVIDER_MALFORMED_RESPONSE', 'Yahoo returned invalid JSON for historical data', { upstreamStatus: response.status, retryable: true });
  }

  const chart = payload as {
    chart?: {
      error?: { code?: string; description?: string } | null;
      result?: Array<{
        timestamp?: Array<number | null>;
        indicators?: {
          adjclose?: Array<{ adjclose?: Array<number | null> }>;
          quote?: Array<{ close?: Array<number | null> }>;
        };
        events?: {
          splits?: Record<string, { date?: number; numerator?: number; denominator?: number; splitRatio?: string }>;
        };
      }> | null;
    };
  };
  const chartError = chart.chart?.error;
  if (chartError) {
    const description = chartError.description ?? chartError.code ?? 'unknown Yahoo error';
    const notFound = /not found|no data|delisted|invalid/i.test(description);
    throw new MarketDataProviderError('yahoo', notFound ? 'SYMBOL_NOT_FOUND' : 'PROVIDER_HTTP', `Yahoo historical data error: ${description}`, { upstreamStatus: response.status, retryable: !notFound });
  }

  const result = chart.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
  const rawClose = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(adjusted)) {
    throw new MarketDataProviderError('yahoo', 'PROVIDER_MALFORMED_RESPONSE', 'Yahoo historical response has no adjusted-close series', { upstreamStatus: response.status, retryable: true });
  }

  const adjustedInput: HistoryBar[] = [];
  const rawInput: HistoryBar[] = [];
  const length = timestamps.length;
  for (let i = 0; i < length; i++) {
    const timestamp = timestamps[i];
    if (!Number.isFinite(timestamp)) continue;
    const date = new Date((timestamp as number) * 1000).toISOString().slice(0, 10);
    const adjustedClose = adjusted[i];
    if (Number.isFinite(adjustedClose) && (adjustedClose as number) > 0) {
      adjustedInput.push({ date, close: adjustedClose as number });
    }
    const close = Array.isArray(rawClose) ? rawClose[i] : null;
    if (Number.isFinite(close) && (close as number) > 0) {
      rawInput.push({ date, close: close as number });
    }
  }

  const bars = normalizePriceHistory(adjustedInput, bounds.lastAllowedDate);
  if (!bars.length) {
    throw new MarketDataProviderError('yahoo', 'PROVIDER_EMPTY_HISTORY', `Yahoo returned no usable adjusted daily history for ${symbol}`, { upstreamStatus: response.status, retryable: true });
  }
  const valuationBars = normalizePriceHistory(rawInput, bounds.lastAllowedDate);
  const splits = normalizeSplits(result?.events?.splits, bounds.lastAllowedDate);
  return {
    bars,
    valuationBars,
    splits,
    provider: 'yahoo',
    priceType: 'adjusted',
    valuationPriceType: valuationBars.length ? 'close' : null,
  };
}

export async function diagnoseFinnhubHistory(symbol: string, period: HistoryPeriod): Promise<{ ok: true; bars: number; status: 'ok' } | { ok: false; failure: ProviderFailure }> {
  const sym = symbol.trim().toUpperCase();
  try {
    const key = getApiKey();
    const bounds = historyBounds(period);
    const to = Math.max(bounds.fromSeconds, bounds.toExclusiveSeconds - 1);
    const url = `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=D&from=${bounds.fromSeconds}&to=${to}&token=${key}`;
    let response: Response;
    try {
      response = await fetchWithTimeout(url);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new MarketDataProviderError('finnhub', 'PROVIDER_TIMEOUT', 'Finnhub historical data request timed out', { retryable: true });
      }
      throw new MarketDataProviderError('finnhub', 'PROVIDER_HTTP', 'Finnhub historical data request failed', { retryable: true });
    }
    if (!response.ok) throw providerHttpError('finnhub', response.status, await safeResponseText(response));
    const data = (await response.json()) as { s?: string; t?: number[]; c?: number[]; error?: string };
    if (data.s !== 'ok') {
      const noData = data.s === 'no_data';
      throw new MarketDataProviderError('finnhub', noData ? 'PROVIDER_EMPTY_HISTORY' : 'PROVIDER_MALFORMED_RESPONSE', `Finnhub stock/candle status ${data.s ?? 'missing'}${data.error ? `: ${data.error}` : ''}`, { upstreamStatus: response.status, retryable: !noData });
    }
    if (!Array.isArray(data.t) || !Array.isArray(data.c) || !data.t.length) {
      throw new MarketDataProviderError('finnhub', 'PROVIDER_EMPTY_HISTORY', `Finnhub returned s: ok but no daily candles for ${sym}`, { upstreamStatus: response.status, retryable: true });
    }
    return { ok: true, bars: Math.min(data.t.length, data.c.length), status: 'ok' };
  } catch (error) {
    const failure = providerFailure(error);
    if (failure) return { ok: false, failure };
    return {
      ok: false,
      failure: {
        provider: 'finnhub',
        code: 'PROVIDER_AUTHENTICATION',
        upstreamStatus: null,
        retryable: false,
        message: error instanceof Error ? error.message : 'Finnhub diagnostic failed',
      },
    };
  }
}

export async function history(symbol: string, period: HistoryPeriod = '1y'): Promise<HistoryResult> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) throw new MarketDataProviderError('yahoo', 'SYMBOL_NOT_FOUND', 'Missing history symbol', { retryable: false });

  const cacheKey = `${sym}:${period}:yahoo-adjusted-raw-splits-v1`;
  const cached = readCache(historyCache, cacheKey);
  if (cached !== undefined) return cached;

  const result = await yahooHistory(sym, period);
  return writeCache(historyCache, cacheKey, result, HISTORY_TTL_MS);
}

export const marketData = { search, quote, history };
