import type { HistoryBar, PortfolioSnapshot, StockSplit } from '../types';
import type { Period, RiskHorizon } from '../types/analytics';
import { reconstructAccountHistory } from './accountHistory';
import { reconstructPortfolioHistory } from './portfolioHistory';
import {
  datedReturns,
  performanceMetrics,
  selectPeriod,
  historyReadouts,
} from './performance';
import { drawdowns } from './drawdown';
import { rollingMetric, rollingPairMetric } from './rolling';
import { downsideDeviation } from './downside';
import {
  calmarRatio,
  historicalTailRisk,
  sharpeRatio,
  sortinoRatio,
} from './ratios';
import { correlation, averageCorrelation } from './correlation';
import { riskContributions } from './riskContribution';
import { benchmarkMetrics, alignReturns } from './benchmark';
import {
  pnlAttribution,
  positionReturn,
  returnAttribution,
} from './attribution';
import { concentration, concentrationSummary } from './lab';
import { annualRateToDaily, EPSILON, volatility } from './statistics';
import { calculatePositions } from './positions';
import { buildCurrentHoldingsRiskProxy } from './returns';
import { currentWeightsHistoricalReplay } from './historicalStress';
import {
  HISTORICAL_TAIL_MIN_OBSERVATIONS,
  MIN_RISK_OBSERVATIONS,
  buildRiskReturnMatrix,
  selectRiskWindow,
} from './riskHorizon';

const RISK_HORIZONS = new Set<RiskHorizon>(['20D', '60D', '1Y']);

export interface AccountAnalyticsMarketData {
  valuationHistories: Map<string, HistoryBar[]>;
  splits: Map<string, StockSplit[]>;
  coverageStarts: Map<string, string>;
}

/**
 * The final arguments retain compatibility with the pre-risk-horizon call shape
 * so older integration callers safely receive the new 60D default.
 */
export function calculatePortfolioAnalytics(
  snapshot: PortfolioSnapshot,
  histories: Map<string, HistoryBar[]>,
  benchmark: string,
  period: Period,
  riskHorizonOrAsOf: RiskHorizon | string,
  asOfOrRf: string | number,
  rfOrMar: number,
  maybeMar?: number,
  accountMarketData?: AccountAnalyticsMarketData,
) {
  const explicitRiskHorizon = RISK_HORIZONS.has(riskHorizonOrAsOf as RiskHorizon);
  const riskHorizon: RiskHorizon = explicitRiskHorizon
    ? (riskHorizonOrAsOf as RiskHorizon)
    : '60D';
  const asOf = explicitRiskHorizon ? String(asOfOrRf) : riskHorizonOrAsOf;
  const rf = explicitRiskHorizon ? rfOrMar : Number(asOfOrRf);
  const mar = explicitRiskHorizon ? (maybeMar ?? 0) : rfOrMar;

  const clean = new Map(
    [...histories].map(([s, bars]) => [
      s,
      bars.filter((b) => b.date <= asOf),
    ]),
  );
  const valuationClean = new Map(
    [...(accountMarketData?.valuationHistories ?? new Map<string, HistoryBar[]>())].map(
      ([s, bars]) => [s, bars.filter((b) => b.date <= asOf)],
    ),
  );

  // Adjusted close remains the return/risk series. Actual cash-aware account
  // history receives raw exchange close only and never silently falls back to
  // adjusted prices. Older snapshots/tests without the capital layer retain the
  // legacy transaction-only reconstruction path.
  const history = snapshot.cashEvents === undefined
    ? reconstructPortfolioHistory(snapshot.transactions, clean, asOf)
    : reconstructAccountHistory(
        snapshot.transactions,
        snapshot.cashEvents,
        valuationClean,
        asOf,
        accountMarketData
          ? {
              splits: accountMarketData.splits,
              coverageStarts: accountMarketData.coverageStarts,
            }
          : undefined,
      );

  // Performance period and current-risk horizon are intentionally independent.
  const points = selectPeriod(history.points, period, asOf);
  const performance = performanceMetrics(points);
  // The horizon is a lookback only for the current-holdings model. Actual risk
  // uses the available transaction-aware performance stream for this period.
  const actualRiskWindow = {
    horizon: riskHorizon,
    required: MIN_RISK_OBSERVATIONS,
    availableObservations: performance.riskReturns.length,
    returns: performance.riskReturns.length >= MIN_RISK_OBSERVATIONS ? performance.riskReturns : [],
    available: performance.riskReturns.length >= MIN_RISK_OBSERVATIONS,
    reason: performance.riskReturns.length >= MIN_RISK_OBSERVATIONS
      ? null
      : `Для actual risk требуется минимум ${MIN_RISK_OBSERVATIONS} валидных transaction-aware return-интервалов; доступно ${performance.riskReturns.length}.`,
  };
  const riskValues = actualRiskWindow.available
    ? actualRiskWindow.returns.map((r) => r.value)
    : [];

  let wealth = 100;
  const returnIndex = performance.returns.length
    ? [
        { date: points[0].date, value: wealth },
        ...performance.returns.map((r) => ({
          date: r.date,
          value: (wealth *= 1 + r.value),
        })),
      ]
    : [];
  const drawdown = performance.riskReturns.length >= MIN_RISK_OBSERVATIONS
    ? drawdowns(returnIndex)
    : null;
  const valueDrawdown = drawdowns(
    points.map((p) => ({ date: p.date, value: p.value })),
  );
  const tail = historicalTailRisk(
    riskValues,
    0.95,
    HISTORICAL_TAIL_MIN_OBSERVATIONS,
  );
  const dailyMar = annualRateToDaily(mar);
  const risk = {
    volatility: volatility(riskValues),
    downside:
      dailyMar === null ? null : downsideDeviation(riskValues, dailyMar),
    sharpe: sharpeRatio(riskValues, rf),
    sortino: sortinoRatio(riskValues, mar),
    calmar: calmarRatio(performance.cagr, drawdown?.max ?? null),
    var95: tail?.var ?? null,
    es95: tail?.es ?? null,
  };
  const riskReason =
    actualRiskWindow.reason ??
    (risk.volatility === null
      ? 'Actual volatility математически не определена: дисперсия ряда нулевая или некорректна.'
      : null);
  const tailRiskReason =
    actualRiskWindow.reason ??
    (riskValues.length < HISTORICAL_TAIL_MIN_OBSERVATIONS
      ? `Для actual historical VaR / Expected Shortfall требуется минимум ${HISTORICAL_TAIL_MIN_OBSERVATIONS} transaction-aware return-интервалов. Доступно: ${riskValues.length}.`
      : tail === null
        ? 'Historical VaR / Expected Shortfall математически не определены для текущей выборки.'
        : null);
  const sortinoReason =
    risk.sortino === null && riskReason === null
      ? 'Sortino недоступен: недостаточно downside-наблюдений относительно дневного MAR или downside deviation равна нулю.'
      : riskReason;

  const rangeHistories = new Map(
    [...clean].map(([s, bars]) => [s, selectPeriod(bars, period, asOf)]),
  );
  const symbols = snapshot.positions.map((p) => p.symbol);
  const riskMatrix = buildRiskReturnMatrix(symbols, clean, riskHorizon);
  const matrix = riskMatrix.matrix;
  const complete =
    snapshot.valuation.complete &&
    snapshot.positions.length > 0 &&
    snapshot.portfolioValue > 0;
  const weights = complete
    ? snapshot.positions.map((p) => p.marketValue! / snapshot.portfolioValue)
    : [];
  const currentConcentration = complete
    ? concentrationSummary(snapshot.positions.map(p => ({ symbol: p.symbol, weight: p.marketValue! / snapshot.portfolioValue, marketValue: p.marketValue! })))
    : null;
  const currentRisk =
    matrix && complete
      ? riskContributions(symbols, weights, matrix.covariance)
      : null;
  const historicalReplay = complete && symbols.length > 0
    ? currentWeightsHistoricalReplay(
        symbols,
        weights,
        symbols.map((symbol) => datedReturns(clean.get(symbol) ?? [])),
      )
    : [];

  // Reuse adjusted asset returns and today's market weights for the current
  // holdings proxy; this is a constant-mix risk model, not actual performance.
  const proxy = buildCurrentHoldingsRiskProxy(
    snapshot.positions,
    clean,
    complete ? weights : [],
  );
  const proxyReturns = proxy.available ? proxy.returns : [];
  const selectedProxyWindow = selectRiskWindow(proxyReturns, riskHorizon);
  const proxyRiskWindow = proxy.available
    ? selectedProxyWindow
    : {
        ...selectedProxyWindow,
        reason: proxy.reason === 'missing_current_market_weights' || proxy.reason === 'invalid_current_market_weights'
          ? 'Нужны полные текущие рыночные стоимости для расчёта нормированных весов.'
          : proxy.reason?.startsWith('insufficient_history_for_')
            ? `Нет достаточной adjusted history для ${proxy.reason.slice('insufficient_history_for_'.length)}.`
            : 'Недостаточно общих исторических return-интервалов текущих позиций.',
      };
  const proxyRiskValues = proxyRiskWindow.available
    ? proxyRiskWindow.returns.map((r) => r.value)
    : [];
  const proxyDrawdownContinuous = proxyRiskWindow.available && proxyRiskWindow.returns.every(
    (item, index, selected) => index === 0 || item.startDate === selected[index - 1].date,
  );
  const proxyDrawdownReturns = proxyRiskWindow.available && proxyDrawdownContinuous
    ? proxyRiskWindow.returns
    : [];
  let proxyWealth = 100;
  const proxyDrawdown = proxyDrawdownReturns.length >= MIN_RISK_OBSERVATIONS
    ? drawdowns([
        { date: proxyDrawdownReturns[0].startDate, value: proxyWealth },
        ...proxyDrawdownReturns.map((item) => ({ date: item.date, value: (proxyWealth *= 1 + item.value) })),
      ])
    : null;
  const proxyDrawdownReason = !proxyRiskWindow.available
    ? proxyRiskWindow.reason
    : !proxyDrawdownContinuous
      ? 'В выбранном окне есть разрыв общих интервалов; drawdown не строится через пропущенные даты.'
      : proxyDrawdown === null
        ? 'Для historical drawdown нужно минимум 20 последовательных общих return-интервалов.'
        : null;

  const benchmarkReturns = datedReturns(rangeHistories.get(benchmark) ?? []);
  const benchmarkResult = benchmarkMetrics(
    performance.riskReturns,
    benchmarkReturns,
    rf,
  );
  const relativeDrawdown = benchmarkResult.comparison.length > 0 && benchmarkResult.comparison.every(point => Number.isFinite(point.portfolio) && Number.isFinite(point.benchmark) && point.benchmark > EPSILON)
    ? drawdowns(benchmarkResult.comparison.map(point => ({ date: point.date, value: point.portfolio / point.benchmark })))
    : null;
  const benchmarkRiskWindow = selectRiskWindow(datedReturns(clean.get(benchmark) ?? []), riskHorizon);
  const currentBenchmarkRisk = benchmarkMetrics(
    proxyRiskWindow.available ? proxyRiskWindow.returns : [],
    benchmarkRiskWindow.available ? benchmarkRiskWindow.returns : [],
    rf,
  );
  const rolling = {
    volatility: Object.fromEntries([20, 60, 252].map(window => [window, rollingMetric(performance.riskReturns, window, 'volatility')])),
    sharpe: Object.fromEntries([20, 60, 252].map(window => [window, rollingMetric(performance.riskReturns, window, 'sharpe', rf)])),
    beta: Object.fromEntries([20, 60, 252].map(window => [window, rollingPairMetric(performance.riskReturns, benchmarkReturns, window, 'beta')])),
    correlation: Object.fromEntries([20, 60, 252].map(window => [window, rollingPairMetric(performance.riskReturns, benchmarkReturns, window, 'correlation')])),
  };

  // P&L is lifetime. Return attribution remains deliberately narrower than the
  // new account-level TWR: it is only valid while holdings stay unchanged and
  // no cash event changes the account after the selected baseline.
  const pnl = pnlAttribution(snapshot.transactions, snapshot.positions);
  const first = points[0];
  const last = points.at(-1);
  const holdings = first
    ? calculatePositions(
        snapshot.transactions.filter(
          (t) =>
            new Date(t.timestamp).toISOString().slice(0, 10) <= first.date,
        ),
      ).positions
    : [];
  const contributionSymbols = holdings.map((p) => p.symbol);
  const priceMaps = new Map(
    contributionSymbols.map((s) => [
      s,
      new Map((clean.get(s) ?? []).map((b) => [b.date, b.close])),
    ]),
  );
  const hasTradeAfterBaseline = Boolean(
    first &&
      last &&
      snapshot.transactions.some((transaction) => {
        const day = new Date(transaction.timestamp).toISOString().slice(0, 10);
        return day > first.date && day <= last.date;
      }),
  );
  const hasCashEventAfterBaseline = Boolean(
    first &&
      last &&
      snapshot.cashEvents?.some((event) => {
        const day = new Date(event.timestamp).toISOString().slice(0, 10);
        return day > first.date && day <= last.date;
      }),
  );
  const initialSecuritiesValue = first
    ? holdings.reduce(
        (sum, position) =>
          sum +
          position.quantity *
            (priceMaps.get(position.symbol)?.get(first.date) ?? Number.NaN),
        0,
      )
    : Number.NaN;
  const attributionEligible = Boolean(
    first &&
      last &&
      !hasTradeAfterBaseline &&
      !hasCashEventAfterBaseline &&
      Number.isFinite(initialSecuritiesValue) &&
      Math.abs(first.value - initialSecuritiesValue) <= EPSILON,
  );
  const contributionPeriods = attributionEligible
    ? performance.returns.map((r) => {
        const prev = holdings.map(
          (p) => p.quantity * (priceMaps.get(p.symbol)?.get(r.startDate) ?? NaN),
        );
        const total = prev.reduce((a, b) => a + b, 0);
        return {
          weights: prev.map((v) => v / total),
          returns: holdings.map(
            (p) =>
              (priceMaps.get(p.symbol)?.get(r.date) ?? NaN) /
                (priceMaps.get(p.symbol)?.get(r.startDate) ?? NaN) -
              1,
          ),
        };
      })
    : [];
  const linked = attributionEligible
    ? returnAttribution(contributionPeriods)
    : null;
  const contributions = linked
    ? contributionSymbols.map((symbol, i) => ({ symbol, value: linked[i] }))
    : [];

  const details = Object.fromEntries(
    snapshot.positions.map((p) => {
      const symbolRiskWindow = selectRiskWindow(
        datedReturns(clean.get(p.symbol) ?? []),
        riskHorizon,
      );
      const selectedReturns = symbolRiskWindow.available
        ? symbolRiskWindow.returns
        : [];
      const aligned = alignReturns(selectedReturns, proxyRiskWindow.returns);
      return [
        p.symbol,
        {
          weight: complete ? p.marketValue! / snapshot.portfolioValue : null,
          positionReturn: positionReturn(p.marketPrice, p.averageCost),
          volatility: volatility(selectedReturns.map((r) => r.value)),
          correlation: correlation(
            aligned.map((r) => r.portfolio),
            aligned.map((r) => r.benchmark),
          ),
          beta: benchmarkMetrics(
            datedReturns(rangeHistories.get(p.symbol) ?? []),
            benchmarkReturns,
            rf,
          ).beta,
          riskContribution:
            currentRisk?.contributions.find((c) => c.symbol === p.symbol)
              ?.normalizedRC ?? null,
        },
      ];
    }),
  );

  return {
    history,
    points,
    readouts: historyReadouts(points),
    performance,
    risk,
    riskHorizon,
    actualRiskWindow,
    riskReason,
    tailRiskReason,
    sortinoReason,
    drawdown,
    valueDrawdown,
    riskMatrix,
    matrix,
    currentRisk,
    averageCorrelation: matrix ? averageCorrelation(matrix.correlation) : null,
    concentration: complete ? concentration(weights) : null,
    concentrationSummary: currentConcentration,
    benchmark: benchmarkResult,
    relativeDrawdown,
    currentBenchmarkRisk,
    whatIfBenchmarkReturns: benchmarkRiskWindow.available ? benchmarkRiskWindow.returns : [],
    historicalReplay,
    rolling,
    pnl,
    contributions,
    contributionReason: linked
      ? null
      : !first || !last
        ? 'Нет непрерывного return-периода для атрибуции.'
        : hasTradeAfterBaseline
          ? 'В выбранном периоде есть BUY/SELL; веса позиций менялись, точный связанный вклад недоступен.'
          : hasCashEventAfterBaseline
            ? 'В выбранном периоде есть cash flow; позиционный return contribution не вычисляется.'
            : !attributionEligible
              ? 'Не удалось восстановить значения позиций на начало периода.'
              : 'Недостаточно общих валидных return-интервалов для связанного вклада.',
    details,
    dataQuality: {
      latestPriceDate: [...clean.values()].flatMap((bars) => bars.map((bar) => bar.date)).sort().at(-1) ?? null,
      returnObservations: performance.riskReturns.length,
      commonObservations: riskMatrix.commonObservations,
      benchmarkOverlap: currentBenchmarkRisk.observations,
    },
    proxy: {
      ...proxy,
      riskWindow: proxyRiskWindow,
      volatility: volatility(proxyRiskValues),
      sharpe: sharpeRatio(proxyRiskValues, rf),
      downside: dailyMar === null ? null : downsideDeviation(proxyRiskValues, dailyMar),
      sortino: sortinoRatio(proxyRiskValues, mar),
      tail: historicalTailRisk(proxyRiskValues, 0.95, HISTORICAL_TAIL_MIN_OBSERVATIONS),
      benchmark: currentBenchmarkRisk,
      drawdown: proxyDrawdown,
      drawdownReason: proxyDrawdownReason,
    },
    sample: `${points[0]?.date ?? '—'} — ${points.at(-1)?.date ?? '—'} · ${performance.riskReturns.length} чистых return-интервалов`,
    riskSample: `${actualRiskWindow.availableObservations} actual transaction-aware return-интервалов`,
    matrixSample: `${riskHorizon} · ${riskMatrix.commonObservations}/${riskMatrix.required} общих интервалов`,
  };
}

export type PortfolioAnalytics = ReturnType<typeof calculatePortfolioAnalytics>;
