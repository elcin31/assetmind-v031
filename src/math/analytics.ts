import type { HistoryBar, PortfolioSnapshot } from '../types';
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
import { concentration } from './lab';
import { annualRateToDaily, EPSILON, volatility } from './statistics';
import { calculatePositions } from './positions';
import { buildCurrentHoldingsRiskProxy } from './returns';
import {
  HISTORICAL_TAIL_MIN_OBSERVATIONS,
  buildRiskReturnMatrix,
  selectActualPortfolioRiskWindow,
  selectRiskWindow,
} from './riskHorizon';

const RISK_HORIZONS = new Set<RiskHorizon>(['20D', '60D', '1Y']);

/**
 * The final arguments retain compatibility with the pre-risk-horizon call shape
 * so older integration callers safely receive the new 20D default.
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
) {
  const explicitRiskHorizon = RISK_HORIZONS.has(riskHorizonOrAsOf as RiskHorizon);
  const riskHorizon: RiskHorizon = explicitRiskHorizon
    ? (riskHorizonOrAsOf as RiskHorizon)
    : '20D';
  const asOf = explicitRiskHorizon ? String(asOfOrRf) : riskHorizonOrAsOf;
  const rf = explicitRiskHorizon ? rfOrMar : Number(asOfOrRf);
  const mar = explicitRiskHorizon ? (maybeMar ?? 0) : rfOrMar;

  const clean = new Map(
    [...histories].map(([s, bars]) => [
      s,
      bars.filter((b) => b.date <= asOf),
    ]),
  );
  // Real application snapshots include the capital layer. The legacy branch is
  // retained only for older snapshot callers/tests that predate cash events.
  const history = snapshot.cashEvents === undefined
    ? reconstructPortfolioHistory(snapshot.transactions, clean, asOf)
    : reconstructAccountHistory(
        snapshot.transactions,
        snapshot.cashEvents,
        clean,
        asOf,
      );

  // Performance period and current-risk horizon are intentionally independent.
  const points = selectPeriod(history.points, period, asOf);
  const performance = performanceMetrics(points);
  const actualRiskWindow = selectActualPortfolioRiskWindow(
    history.points,
    riskHorizon,
  );
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
  const drawdown = drawdowns(returnIndex);
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
      ? `${riskHorizon} volatility математически не определена: дисперсия ряда нулевая или некорректна.`
      : null);
  const tailRiskReason =
    actualRiskWindow.reason ??
    (riskValues.length < HISTORICAL_TAIL_MIN_OBSERVATIONS
      ? `Для historical VaR / Expected Shortfall требуется минимум ${HISTORICAL_TAIL_MIN_OBSERVATIONS} валидных return-интервалов. В ${riskHorizon} окне доступно: ${riskValues.length}.`
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
  const currentRisk =
    matrix && complete
      ? riskContributions(symbols, weights, matrix.covariance)
      : null;

  // Proxy always starts from full available history; only current-risk metrics use
  // the selected horizon. Historical stress continues to use the full proxy series.
  const proxy = buildCurrentHoldingsRiskProxy(snapshot.positions, clean);
  const proxyReturns = proxy.available ? proxy.returns : [];
  const proxyRiskWindow = selectRiskWindow(proxyReturns, riskHorizon);
  const proxyRiskValues = proxyRiskWindow.available
    ? proxyRiskWindow.returns.map((r) => r.value)
    : [];
  const proxyDrawdown = proxy.available
    ? drawdowns(
        proxy.dates.map((date, i) => ({ date, value: proxy.values[i] })),
      )
    : null;

  const benchmarkReturns = datedReturns(rangeHistories.get(benchmark) ?? []);
  const benchmarkResult = benchmarkMetrics(
    performance.riskReturns,
    benchmarkReturns,
    rf,
  );

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
              ?.fraction ?? null,
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
    benchmark: benchmarkResult,
    pnl,
    contributions,
    details,
    proxy: {
      ...proxy,
      riskWindow: proxyRiskWindow,
      volatility: volatility(proxyRiskValues),
      sharpe: sharpeRatio(proxyRiskValues, rf),
      drawdown: proxyDrawdown,
    },
    sample: `${points[0]?.date ?? '—'} — ${points.at(-1)?.date ?? '—'} · ${performance.riskReturns.length} чистых return-интервалов`,
    riskSample: `${riskHorizon} · ${actualRiskWindow.availableObservations}/${actualRiskWindow.required} фактических валидных интервалов`,
    matrixSample: `${riskHorizon} · ${riskMatrix.commonObservations}/${riskMatrix.required} общих интервалов`,
  };
}

export type PortfolioAnalytics = ReturnType<typeof calculatePortfolioAnalytics>;
