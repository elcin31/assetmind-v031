import type { HistoryBar } from '../types';
import type {
  CorrelationMatrix,
  DatedReturn,
  PortfolioHistoryPoint,
  RiskHorizon,
} from '../types/analytics';
import { correlation } from './correlation';
import { covariance, TRADING_DAYS } from './statistics';
import { datedReturns } from './performance';

export const RISK_HORIZON_INTERVALS: Readonly<Record<RiskHorizon, number>> = {
  '20D': 20,
  '60D': 60,
  '1Y': 252,
};

export const HISTORICAL_TAIL_MIN_OBSERVATIONS = 60;
export const MIN_RISK_OBSERVATIONS = 20;

export interface RiskHorizonConfig {
  horizon: RiskHorizon;
  intervals: number;
  label: string;
}

export interface RiskWindowSelection {
  horizon: RiskHorizon;
  required: number;
  availableObservations: number;
  returns: DatedReturn[];
  available: boolean;
  reason: string | null;
}

export interface RiskMatrixSelection {
  horizon: RiskHorizon;
  required: number;
  commonObservations: number;
  matrix: CorrelationMatrix | null;
  limitingSymbols: string[];
  reason: string | null;
}

export function resolveRiskHorizon(horizon: RiskHorizon): RiskHorizonConfig {
  return {
    horizon,
    intervals: RISK_HORIZON_INTERVALS[horizon],
    label: horizon,
  };
}

/** Select the latest exact number of already-valid return intervals. Never pads. */
export function selectRiskWindow(
  returns: DatedReturn[],
  horizon: RiskHorizon,
): RiskWindowSelection {
  const required = resolveRiskHorizon(horizon).intervals;
  const ordered = [...returns].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startDate.localeCompare(b.startDate),
  );
  if (ordered.length < MIN_RISK_OBSERVATIONS) {
    return {
      horizon,
      required,
      availableObservations: ordered.length,
      returns: [],
      available: false,
      reason: `Нужно минимум ${MIN_RISK_OBSERVATIONS} общих исторических return-интервалов для ${horizon} Risk. Доступно: ${ordered.length}.`,
    };
  }
  return {
    horizon,
    required,
    availableObservations: Math.min(required, ordered.length),
    returns: ordered.slice(-required),
    available: true,
    reason: null,
  };
}

/**
 * Actual transaction-aware risk is stricter than the proxy: the latest N
 * chronological portfolio return slots must all be known. Older clean returns
 * may not be pulled across a BUY/SELL or missing-price gap to fill the window.
 */
export function selectActualPortfolioRiskWindow(
  points: PortfolioHistoryPoint[],
  horizon: RiskHorizon,
): RiskWindowSelection {
  const required = resolveRiskHorizon(horizon).intervals;
  const startIndex = Math.max(1, points.length - required);
  const slots = points.slice(startIndex);
  const validCount = slots.filter((point) => point.dailyReturn !== null).length;

  if (slots.length < required || validCount < required) {
    return {
      horizon,
      required,
      availableObservations: validCount,
      returns: [],
      available: false,
      reason: `Для фактического ${horizon} Risk нужно ${required} последовательных валидных portfolio return-интервалов. Доступно: ${validCount}. BUY/SELL, неизвестный external flow и ценовые разрывы не подменяются нулём и не перескакиваются.`,
    };
  }

  const returns = slots.map((point, offset): DatedReturn => {
    const index = startIndex + offset;
    return {
      startDate: points[index - 1].date,
      date: point.date,
      value: point.dailyReturn!,
    };
  });

  return {
    horizon,
    required,
    availableObservations: required,
    returns,
    available: true,
    reason: null,
  };
}

/**
 * Build one covariance/correlation matrix from the same latest common sample
 * for every symbol. Intervals align by both endpoints, so a missing quote is
 * never bridged or forward-filled.
 */
export function buildRiskReturnMatrix(
  symbols: string[],
  histories: Map<string, HistoryBar[]>,
  horizon: RiskHorizon,
): RiskMatrixSelection {
  const required = resolveRiskHorizon(horizon).intervals;
  if (!symbols.length || new Set(symbols).size !== symbols.length) {
    return {
      horizon,
      required,
      commonObservations: 0,
      matrix: null,
      limitingSymbols: symbols,
      reason: `Для ${horizon} covariance matrix нужен непустой список уникальных активов.`,
    };
  }

  const series = symbols.map((symbol) => datedReturns(histories.get(symbol) ?? []));
  const maps = series.map(
    (returns) => new Map(returns.map((r) => [`${r.startDate}/${r.date}`, r])),
  );
  const commonKeys = [...maps[0].keys()]
    .filter((key) => maps.every((map) => map.has(key)))
    .sort((a, b) => {
      const [as, ae] = a.split('/');
      const [bs, be] = b.split('/');
      return ae.localeCompare(be) || as.localeCompare(bs);
    });
  const commonObservations = commonKeys.length;
  const shortest = Math.min(...series.map((returns) => returns.length));
  const limitingSymbols = symbols.filter(
    (_, index) => series[index].length === shortest,
  );

  if (commonObservations < MIN_RISK_OBSERVATIONS) {
    return {
      horizon,
      required,
      commonObservations,
      matrix: null,
      limitingSymbols,
      reason: `Нужно минимум ${MIN_RISK_OBSERVATIONS} общих исторических интервалов для covariance matrix (${symbols.join(', ')}). Доступно: ${commonObservations}.`,
    };
  }

  const observations = Math.min(required, commonObservations);
  const keys = commonKeys.slice(-observations);
  const returns = maps.map((map) => keys.map((key) => map.get(key)!));
  const values = returns.map((row) => row.map((r) => r.value));
  const cov = values.map((a) => values.map((b) => covariance(a, b, observations)));
  const corr = values.map((a) => values.map((b) => correlation(a, b, observations)));

  if (
    cov.some((row) => row.some((value) => value === null || !Number.isFinite(value))) ||
    corr.some((row) => row.some((value) => value === null || !Number.isFinite(value)))
  ) {
    return {
      horizon,
      required,
      commonObservations,
      matrix: null,
      limitingSymbols,
      reason: `Correlation/covariance matrix не определена: нулевая дисперсия актива или некорректная матрица на ${observations} общих интервалах.`,
    };
  }

  return {
    horizon,
    required,
    commonObservations,
    limitingSymbols,
    reason: null,
    matrix: {
      symbols,
      returns,
      covariance: (cov as number[][]).map((row) =>
        row.map((value) => value * TRADING_DAYS),
      ),
      correlation: corr as number[][],
      observations,
    },
  };
}
