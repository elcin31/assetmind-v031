import type { HistoryBar, StockSplit } from '../types';
import { normalizePriceHistory } from '../utils/priceHistory';

export interface HistoricalMarketData {
  /** Adjusted close for returns/risk. */
  bars: HistoryBar[];
  /** Raw close for actual account valuation. Empty means unavailable. */
  valuationBars: HistoryBar[];
  /** Corporate-action splits detected by the market-data provider. */
  splits: StockSplit[];
  provider: string | null;
  priceType: string | null;
  valuationPriceType: string | null;
}

type Entry = { expires: number; promise: Promise<HistoricalMarketData> };
const cache = new Map<string, Entry>();

export interface HistoryRequestIssue {
  symbol: string;
  code: string;
  provider: string | null;
  status: number;
  upstreamStatus: number | null;
  retryable: boolean;
  message: string;
}

export class HistoryRequestError extends Error {
  readonly issue: HistoryRequestIssue;
  constructor(issue: HistoryRequestIssue) {
    super(issue.message);
    this.name = 'HistoryRequestError';
    this.issue = issue;
  }
}

function issueMessage(
  symbol: string,
  code: string,
  provider: string | null,
  upstreamStatus: number | null,
): string {
  const source = provider ? `${provider}: ` : '';
  switch (code) {
    case 'PROVIDER_AUTHENTICATION':
      return `${symbol}: ${source}ошибка авторизации поставщика${upstreamStatus ? ` (${upstreamStatus})` : ''}`;
    case 'PROVIDER_FORBIDDEN':
      return `${symbol}: ${source}исторические данные запрещены тарифом/правами${upstreamStatus ? ` (${upstreamStatus})` : ''}`;
    case 'PROVIDER_RATE_LIMIT':
      return `${symbol}: ${source}лимит запросов к истории (429), повторите загрузку`;
    case 'PROVIDER_TIMEOUT':
      return `${symbol}: ${source}таймаут поставщика истории`;
    case 'PROVIDER_EMPTY_HISTORY':
      return `${symbol}: ${source}поставщик вернул пустую историческую серию`;
    case 'SYMBOL_NOT_FOUND':
      return `${symbol}: ${source}история символа не найдена`;
    case 'PROVIDER_MALFORMED_RESPONSE':
      return `${symbol}: ${source}некорректный ответ поставщика истории`;
    default:
      return `${symbol}: ${source}поставщик истории недоступен${upstreamStatus ? ` (${upstreamStatus})` : ''}`;
  }
}

function keyFor(symbol: string, period: string) {
  return `${symbol.trim().toUpperCase()}:${period}`;
}

function normalizeSplits(value: unknown): StockSplit[] {
  if (!Array.isArray(value)) return [];
  const normalized: StockSplit[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const split = item as Partial<StockSplit>;
    if (
      typeof split.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(split.date) ||
      typeof split.timestamp !== 'string' ||
      !Number.isFinite(Date.parse(split.timestamp)) ||
      typeof split.numerator !== 'number' ||
      !Number.isFinite(split.numerator) ||
      split.numerator <= 0 ||
      typeof split.denominator !== 'number' ||
      !Number.isFinite(split.denominator) ||
      split.denominator <= 0 ||
      typeof split.ratio !== 'number' ||
      !Number.isFinite(split.ratio) ||
      split.ratio <= 0 ||
      Math.abs(split.ratio - split.numerator / split.denominator) > 1e-9
    ) continue;
    normalized.push({
      date: split.date,
      timestamp: split.timestamp,
      numerator: split.numerator,
      denominator: split.denominator,
      ratio: split.ratio,
    });
  }
  return normalized.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/** Evict one cached request, or all historical requests when symbol is omitted. */
export function clearHistoryCache(symbol?: string, period = '5y') {
  if (!symbol) {
    cache.clear();
    return;
  }
  cache.delete(keyFor(symbol, period));
}

/**
 * Public market data only. One cached response carries both adjusted returns data
 * and raw valuation data so charts/risk/account-history do not duplicate requests.
 */
export function loadHistoricalMarketData(
  symbol: string,
  period = '5y',
  options: { force?: boolean } = {},
): Promise<HistoricalMarketData> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const key = keyFor(normalizedSymbol, period);
  if (options.force) cache.delete(key);
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.promise;

  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(
        `/api/history?symbol=${encodeURIComponent(normalizedSymbol)}&period=${encodeURIComponent(period)}`,
        { signal: AbortSignal.timeout(12_000), cache: 'no-store' },
      );
    } catch (error) {
      const timeout =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new HistoryRequestError({
        symbol: normalizedSymbol,
        code: timeout ? 'PROVIDER_TIMEOUT' : 'NETWORK_ERROR',
        provider: null,
        status: 0,
        upstreamStatus: null,
        retryable: true,
        message: timeout
          ? `${normalizedSymbol}: таймаут запроса истории`
          : `${normalizedSymbol}: сеть недоступна при загрузке истории`,
      });
    }

    let data: {
      symbol?: string;
      period?: string;
      bars?: unknown;
      valuationBars?: unknown;
      splits?: unknown;
      code?: string;
      provider?: string;
      priceType?: string;
      valuationPriceType?: string | null;
      upstreamStatus?: number | null;
      retryable?: boolean;
    } = {};
    try {
      data = await response.json();
    } catch {
      // A non-JSON provider/API failure remains distinguishable from no history.
    }

    if (!response.ok) {
      const code = data.code ?? `HTTP_${response.status}`;
      const provider = typeof data.provider === 'string' ? data.provider : null;
      const upstreamStatus =
        typeof data.upstreamStatus === 'number' ? data.upstreamStatus : null;
      throw new HistoryRequestError({
        symbol: normalizedSymbol,
        code,
        provider,
        status: response.status,
        upstreamStatus,
        retryable:
          data.retryable ?? (response.status === 429 || response.status >= 500),
        message: issueMessage(normalizedSymbol, code, provider, upstreamStatus),
      });
    }

    if (data.symbol !== normalizedSymbol || data.period !== period) {
      throw new HistoryRequestError({
        symbol: normalizedSymbol,
        code: 'RESPONSE_MISMATCH',
        provider: typeof data.provider === 'string' ? data.provider : null,
        status: response.status,
        upstreamStatus: null,
        retryable: true,
        message: `${normalizedSymbol}: поставщик вернул историю другого актива или периода`,
      });
    }

    const bars = normalizePriceHistory(data.bars);
    if (!bars.length) {
      throw new HistoryRequestError({
        symbol: normalizedSymbol,
        code: 'PROVIDER_EMPTY_HISTORY',
        provider: typeof data.provider === 'string' ? data.provider : null,
        status: response.status,
        upstreamStatus: null,
        retryable: true,
        message: issueMessage(
          normalizedSymbol,
          'PROVIDER_EMPTY_HISTORY',
          typeof data.provider === 'string' ? data.provider : null,
          null,
        ),
      });
    }

    return {
      bars,
      valuationBars: normalizePriceHistory(data.valuationBars),
      splits: normalizeSplits(data.splits),
      provider: typeof data.provider === 'string' ? data.provider : null,
      priceType: typeof data.priceType === 'string' ? data.priceType : null,
      valuationPriceType:
        typeof data.valuationPriceType === 'string' ? data.valuationPriceType : null,
    } satisfies HistoricalMarketData;
  })();

  cache.set(key, { expires: Date.now() + 300_000, promise });
  void promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return promise;
}

/** Backward-compatible adjusted-close consumer for price charts and risk-only callers. */
export async function loadHistory(
  symbol: string,
  period = '5y',
  options: { force?: boolean } = {},
): Promise<HistoryBar[]> {
  return (await loadHistoricalMarketData(symbol, period, options)).bars;
}
