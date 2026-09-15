/**
 * Server-only market data abstraction.
 * Current provider: Finnhub.
 */

import { searchInstruments as fallbackSearch } from '../src/data/instruments.js';
import type { HistoryBar, Quote, SearchResult } from '../src/types';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const PROVIDER_TIMEOUT_MS = 8_000;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const searchCache = new Map<string, CacheEntry<SearchResult[]>>();
const quoteCache = new Map<string, CacheEntry<Quote | null>>();
const historyCache = new Map<string, CacheEntry<HistoryBar[]>>();

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

function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number
): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function providerSignal(): AbortSignal {
  return AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
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
    const res = await fetch(url, { signal: providerSignal() });
    if (!res.ok) throw new Error(`Finnhub search HTTP ${res.status}`);

    const data = (await res.json()) as {
      result?: Array<{
        symbol: string;
        description: string;
        type: string;
        displaySymbol?: string;
      }>;
    };

    if (!Array.isArray(data.result)) {
      return writeCache(searchCache, cacheKey, fallbackSearch(q), 30_000);
    }

    const unique = new Map<string, SearchResult>();
    for (const result of data.result) {
      const symbol = result.symbol?.trim().toUpperCase();
      if (!symbol || !result.description || unique.has(symbol)) continue;
      unique.set(symbol, {
        symbol,
        name: result.description,
        exchange: '',
        country: '',
      });
      if (unique.size >= 20) break;
    }

    const normalized = [...unique.values()];
    return writeCache(
      searchCache,
      cacheKey,
      normalized.length > 0 ? normalized : fallbackSearch(q),
      60_000
    );
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
    const res = await fetch(url, { signal: providerSignal() });
    if (!res.ok) return writeCache(quoteCache, sym, null, 5_000);

    const data = (await res.json()) as {
      c?: number;
      d?: number;
      dp?: number;
      t?: number;
    };

    if (data.c === undefined || data.c === 0 || !Number.isFinite(data.c)) {
      return writeCache(quoteCache, sym, null, 5_000);
    }

    return writeCache(
      quoteCache,
      sym,
      {
        symbol: sym,
        price: data.c,
        change: data.d ?? 0,
        changePercent: data.dp ?? 0,
        timestamp: data.t ?? Math.floor(Date.now() / 1000),
      },
      15_000
    );
  } catch {
    return writeCache(quoteCache, sym, null, 5_000);
  }
}

export type HistoryPeriod = '1m' | '3m' | '6m' | '1y' | '2y' | '5y';

function periodToSeconds(period: HistoryPeriod): number {
  const day = 86_400;
  switch (period) {
    case '1m':
      return 30 * day;
    case '3m':
      return 90 * day;
    case '6m':
      return 180 * day;
    case '1y':
      return 365 * day;
    case '2y':
      return 730 * day;
    case '5y':
      return 1_825 * day;
  }
}

export async function history(
  symbol: string,
  period: HistoryPeriod = '1y'
): Promise<HistoryBar[]> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return [];

  const cacheKey = `${sym}:${period}`;
  const cached = readCache(historyCache, cacheKey);
  if (cached !== undefined) return cached;

  const key = getApiKey();

  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - periodToSeconds(period);
    const url = `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(
      sym
    )}&resolution=D&from=${from}&to=${to}&token=${key}`;

    const res = await fetch(url, { signal: providerSignal() });
    if (!res.ok) return writeCache(historyCache, cacheKey, [], 60_000);

    const data = (await res.json()) as {
      s?: string;
      t?: number[];
      c?: number[];
    };

    if (data.s !== 'ok' || !data.t || !data.c || data.t.length === 0) {
      return writeCache(historyCache, cacheKey, [], 60_000);
    }

    const bars: HistoryBar[] = [];
    const length = Math.min(data.t.length, data.c.length);
    for (let i = 0; i < length; i++) {
      const timestamp = data.t[i];
      const close = data.c[i];
      if (!Number.isFinite(timestamp) || !Number.isFinite(close)) continue;
      bars.push({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        close,
      });
    }

    return writeCache(historyCache, cacheKey, bars, 15 * 60_000);
  } catch {
    return writeCache(historyCache, cacheKey, [], 60_000);
  }
}

export const marketData = { search, quote, history };
