import type { HistoryBar, PortfolioSnapshot } from '../types';
import type { Period } from '../types/analytics';
import { reconstructPortfolioHistory } from './portfolioHistory';
import { datedReturns, performanceMetrics, selectPeriod } from './performance';
import { drawdowns } from './drawdown';
import { downsideDeviation } from './downside';
import { calmarRatio, historicalTailRisk, sharpeRatio, sortinoRatio } from './ratios';
import { correlation, correlationMatrix, averageCorrelation } from './correlation';
import { riskContributions } from './riskContribution';
import { benchmarkMetrics, alignReturns } from './benchmark';
import { pnlAttribution, positionReturn, returnAttribution } from './attribution';
import { concentration } from './lab';
import { volatility } from './statistics';
import { calculatePositions } from './positions';
import { buildCurrentHoldingsRiskProxy } from './returns';

export function calculatePortfolioAnalytics(snapshot: PortfolioSnapshot, histories: Map<string, HistoryBar[]>, benchmark: string, period: Period, asOf: string, rf: number, mar: number) {
  const clean = new Map([...histories].map(([s, bars]) => [s, bars.filter(b => b.date <= asOf)]));
  const history = reconstructPortfolioHistory(snapshot.transactions, clean, asOf);
  const points = selectPeriod(history.points, period, asOf);
  const performance = performanceMetrics(points);
  const values = performance.returns.map(r => r.value);
  let wealth = 100;
  const returnIndex = performance.returns.length ? [{ date: points[0].date, value: wealth }, ...performance.returns.map(r => ({ date: r.date, value: wealth *= 1 + r.value }))] : [];
  const drawdown = drawdowns(returnIndex);
  const valueDrawdown = drawdowns(points.map(p => ({ date: p.date, value: p.value })));
  const tail = historicalTailRisk(values);
  const risk = { volatility: volatility(values), downside: downsideDeviation(values, mar / 252), sharpe: sharpeRatio(values, rf), sortino: sortinoRatio(values, mar), calmar: calmarRatio(performance.cagr, drawdown?.max ?? null), var95: tail?.var ?? null, es95: tail?.es ?? null };
  const rangeHistories = new Map([...clean].map(([s, bars]) => [s, selectPeriod(bars, period, asOf)]));
  const symbols = snapshot.positions.map(p => p.symbol);
  const matrix = correlationMatrix(symbols, rangeHistories);
  const complete = snapshot.valuation.complete && snapshot.positions.length > 0 && snapshot.portfolioValue > 0;
  const weights = complete ? snapshot.positions.map(p => p.marketValue! / snapshot.portfolioValue) : [];
  const currentRisk = matrix && complete ? riskContributions(symbols, weights, matrix.covariance) : null;
  const proxy = buildCurrentHoldingsRiskProxy(snapshot.positions, rangeHistories);
  const proxyReturns = proxy.available ? proxy.dailyReturns.map((value, i) => ({ value, date: proxy.dates[i + 1], startDate: proxy.dates[i] })) : [];
  const benchmarkReturns = datedReturns(rangeHistories.get(benchmark) ?? []);
  const benchmarkResult = benchmarkMetrics(performance.returns, benchmarkReturns, rf);
  // P&L is lifetime; return attribution is strictly the selected no-trade historical period.
  const pnl = pnlAttribution(snapshot.transactions, snapshot.positions);
  const first = points[0];
  const holdings = first ? calculatePositions(snapshot.transactions.filter(t => new Date(t.timestamp).toISOString().slice(0, 10) <= first.date)).positions : [];
  const contributionSymbols = holdings.map(p => p.symbol);
  const priceMaps = new Map(contributionSymbols.map(s => [s, new Map((clean.get(s) ?? []).map(b => [b.date, b.close]))]));
  const contributionPeriods = performance.returns.map(r => {
    const prev = holdings.map(p => p.quantity * (priceMaps.get(p.symbol)?.get(r.startDate) ?? NaN));
    const total = prev.reduce((a, b) => a + b, 0);
    return { weights: prev.map(v => v / total), returns: holdings.map(p => (priceMaps.get(p.symbol)?.get(r.date) ?? NaN) / (priceMaps.get(p.symbol)?.get(r.startDate) ?? NaN) - 1) };
  });
  const linked = returnAttribution(contributionPeriods);
  const contributions = linked ? contributionSymbols.map((symbol, i) => ({ symbol, value: linked[i] })) : [];
  const details = Object.fromEntries(snapshot.positions.map(p => {
    const returns = datedReturns(rangeHistories.get(p.symbol) ?? []);
    const aligned = alignReturns(returns, proxyReturns);
    return [p.symbol, { positionReturn: positionReturn(p.marketPrice, p.averageCost), volatility: volatility(returns.map(r => r.value)), correlation: correlation(aligned.map(r => r.portfolio), aligned.map(r => r.benchmark)), beta: benchmarkMetrics(returns, benchmarkReturns, rf).beta, riskContribution: currentRisk?.contributions.find(c => c.symbol === p.symbol)?.fraction ?? null }];
  }));
  return { history, points, performance, risk, drawdown, valueDrawdown, matrix, currentRisk,
    averageCorrelation: matrix ? averageCorrelation(matrix.correlation) : null,
    concentration: complete ? concentration(weights) : null,
    benchmark: benchmarkResult, pnl, contributions, details,
    proxy: { ...proxy, volatility: volatility(proxy.dailyReturns), sharpe: sharpeRatio(proxy.dailyReturns, rf) },
    sample: `${points[0]?.date ?? '—'} — ${points.at(-1)?.date ?? '—'} · ${values.length} доходностей`,
  };
}
export type PortfolioAnalytics = ReturnType<typeof calculatePortfolioAnalytics>;
