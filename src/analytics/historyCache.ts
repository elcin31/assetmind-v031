import type { HistoryBar } from '../types';
import { normalizePriceHistory } from '../utils/priceHistory';

type Entry = { expires: number; promise: Promise<HistoryBar[]> };
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

/** Evict one cached request, or all historical requests when symbol is omitted. */
export function clearHistoryCache(symbol?: string, period = '5y') {
  if (!symbol) {
    cache.clear();
    return;
  }
  cache.delete(keyFor(symbol, period));
}

/** Public market data only. Pending requests are shared; failures are never retained. */
export function loadHistory(
  symbol: string,
  period = '5y',
  options: { force?: boolean } = {},
): Promise<HistoryBar[]> {
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
      code?: string;
      provider?: string;
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
    return bars;
  })();

  cache.set(key, { expires: Date.now() + 300_000, promise });
  void promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return promise;
}
