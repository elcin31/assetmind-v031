import { useMemo, useState } from 'react';
import type { AnalyticsController } from '../analytics/usePortfolioAnalytics';
import type { PortfolioSnapshot } from '../types';
import { efficientFrontier } from '../math/portfolioOptimization';
import { pct, numeric } from '../utils/analyticsFormat';
import { buildXRayInsights } from '../math/xrayInsights';

export function EfficientFrontierPanel({ snapshot, controller: c, onLoadWeights }: { snapshot: PortfolioSnapshot; controller: AnalyticsController; onLoadWeights: (weights: number[]) => void }) {
  const [selected, setSelected] = useState<'current' | 'minimumVariance' | 'maximumHistoricalSharpe'>('current');
  const analytics = c.analytics;
  const matrix = analytics.matrix;
  const symbols = useMemo(() => snapshot.positions.map((position) => position.symbol), [snapshot.positions]);
  const currentWeights = useMemo(() => snapshot.valuation.complete && snapshot.portfolioValue > 0
    ? snapshot.positions.map((position) => (position.marketValue ?? Number.NaN) / snapshot.portfolioValue)
    : [], [snapshot.positions, snapshot.portfolioValue, snapshot.valuation.complete]);
  const result = useMemo(() => matrix
    ? efficientFrontier(symbols, currentWeights, matrix.returns.map((series) => series.map((item) => item.value)), matrix.covariance, c.rf / 100)
    : null, [matrix, symbols, currentWeights, c.rf]);
  const selectedPoint = result?.[selected] ?? null;
  const frontierInsights = result ? buildXRayInsights({ positions: [], averagePairwiseCorrelation: null, currentDrawdown: null, maxDrawdown: null, commonObservations: result.observations, requiredObservations: result.observations, minimumVarianceVolatility: { current: result.current.annualizedVolatility, minimumVariance: result.minimumVariance.annualizedVolatility } }).filter((item) => item.id === 'minimum-variance-risk-gap') : [];

  return <div className="lab-grid frontier-layout">
    <section className="card">
      <div className="section-heading"><div><h2>Efficient Frontier</h2><p className="caption">Long-only portfolios из текущих позиций, общей выборки доходностей и covariance {c.riskHorizon}.</p></div><span className="tag">Historical optimization</span></div>
      <p className="notice">Оптимизация описывает только историческую выборку. Прошлые доходности не определяют будущие результаты.</p>
      {snapshot.positions.length < 2 ? <p className="notice">Для efficient frontier нужны минимум две позиции; для одного актива она не применяется.</p> : !matrix ? <p className="notice">{analytics.riskMatrix.reason ?? 'Недостаточно общих наблюдений для covariance matrix.'}</p> : !result ? <p className="notice">Frontier unavailable: covariance singular/unstable либо данных недостаточно для устойчивого long-only решения.</p> : <>
        <div className="frontier-chart-wrap"><FrontierChart result={result} selected={selected} onSelect={setSelected} /></div>
        <div className="frontier-specials">
          <button type="button" aria-pressed={selected === 'current'} onClick={() => setSelected('current')}><span>Current Portfolio</span><b>{pct(result.current.annualizedVolatility)} volatility</b></button>
          <button type="button" aria-pressed={selected === 'minimumVariance'} onClick={() => setSelected('minimumVariance')}><span>Minimum Variance</span><b>{pct(result.minimumVariance.annualizedVolatility)} volatility</b></button>
          <button type="button" aria-pressed={selected === 'maximumHistoricalSharpe'} onClick={() => setSelected('maximumHistoricalSharpe')}><span>Maximum Historical Sharpe</span><b>{numeric(result.maximumHistoricalSharpe.historicalSharpe)} Sharpe</b></button>
        </div>
      </>}
      <p className="caption">Observations: {matrix?.observations ?? 'Недостаточно данных'} · Annualization: daily mean × 252, covariance × 252 · Risk-free rate: {c.rf}% annualized{result ? ` · covariance regularization ε=${result.regularization.toExponential(2)}` : ''}.</p>
      {frontierInsights.map((item) => <p className="caption" key={item.id}>{item.title}: {item.message}</p>)}
    </section>
    {result && selectedPoint && <section className="card">
      <div className="section-heading"><div><h2>{selected === 'current' ? 'Current Portfolio' : selected === 'minimumVariance' ? 'Minimum Variance Portfolio' : 'Maximum Historical Sharpe Portfolio'}</h2><p className="caption">Historical return and risk for the selected feasible point.</p></div><button className="btn btn-ghost" type="button" onClick={() => onLoadWeights(selectedPoint.weights)}>Load into What-if</button></div>
      <div className="analytics-metrics"><PointMetric label="Annualized Historical Return" value={selectedPoint.annualizedReturn} format={pct} /><PointMetric label="Annualized Volatility" value={selectedPoint.annualizedVolatility} format={pct} /><PointMetric label="Historical Sharpe" value={selectedPoint.historicalSharpe} format={numeric} /></div>
      <div className="table-scroll"><table><thead><tr><th>Symbol</th><th>Current Weight</th><th>Selected Weight</th><th>Δ</th></tr></thead><tbody>{symbols.map((symbol, index) => <tr key={symbol}><th scope="row">{symbol}</th><td>{Number.isFinite(currentWeights[index]) ? pct(currentWeights[index]) : 'Недостаточно данных'}</td><td>{pct(selectedPoint.weights[index])}</td><td>{pct(selectedPoint.weights[index] - currentWeights[index])}</td></tr>)}</tbody></table></div>
      <p className="caption">Long-only constraint: веса ≥ 0 и сумма весов = 100%. Загрузка меняет только What-if sandbox. Portfolio positions и транзакции остаются без изменений.</p>
    </section>}
    <section className="card"><h2>Метод</h2><p className="caption">Кривая строится детерминированным sweep по выпуклым long-only комбинациям return/variance. Minimum Variance решается projected-gradient методом; Maximum Historical Sharpe выбирается среди построенных feasible points и вершин состава. При near-singular covariance применяется минимальное diagonal ε, достаточное для конечного PSD расчёта: max(1e−12, max(diag(Σ)) × 1e−8), с ограниченным числом повторов. Значение ε показано выше.</p><p className="caption">Это численное приближение по ограниченной сетке, не глобальная гарантия для непрерывного пространства весов.</p></section>
  </div>;
}

function PointMetric({ label, value, format }: { label: string; value: number | null; format: (value: number) => string }) {
  return <div className="analytics-metric"><span>{label}</span><strong>{value == null || !Number.isFinite(value) ? 'Недостаточно данных' : format(value)}</strong></div>;
}

function FrontierChart({ result, selected, onSelect }: { result: NonNullable<ReturnType<typeof efficientFrontier>>; selected: string; onSelect: (value: 'current' | 'minimumVariance' | 'maximumHistoricalSharpe') => void }) {
  const width = 720; const height = 300; const pad = { left: 65, right: 24, top: 20, bottom: 50 };
  const points = result.points;
  const xMin = Math.min(...points.map((point) => point.annualizedVolatility));
  const xMax = Math.max(...points.map((point) => point.annualizedVolatility));
  const yMin = Math.min(...points.map((point) => point.annualizedReturn));
  const yMax = Math.max(...points.map((point) => point.annualizedReturn));
  const x = (value: number) => pad.left + ((value - xMin) / Math.max(xMax - xMin, 1e-12)) * (width - pad.left - pad.right);
  const y = (value: number) => height - pad.bottom - ((value - yMin) / Math.max(yMax - yMin, 1e-12)) * (height - pad.top - pad.bottom);
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(point.annualizedVolatility)} ${y(point.annualizedReturn)}`).join(' ');
  const marks = [
    { id: 'current' as const, point: result.current, label: 'Current Portfolio' },
    { id: 'minimumVariance' as const, point: result.minimumVariance, label: 'Minimum Variance' },
    { id: 'maximumHistoricalSharpe' as const, point: result.maximumHistoricalSharpe, label: 'Maximum Historical Sharpe' },
  ];
  return <svg className="frontier-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Efficient frontier: annualized historical return versus volatility">
    <line x1={pad.left} y1={height-pad.bottom} x2={width-pad.right} y2={height-pad.bottom} className="frontier-axis" />
    <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height-pad.bottom} className="frontier-axis" />
    <path d={path} className="frontier-path" />
    {points.map((point,index)=><circle key={`${index}-${point.annualizedReturn}`} cx={x(point.annualizedVolatility)} cy={y(point.annualizedReturn)} r="3" className="frontier-dot"><title>{`Return ${pct(point.annualizedReturn)} · Volatility ${pct(point.annualizedVolatility)} · Sharpe ${numeric(point.historicalSharpe)}`}</title></circle>)}
    {marks.map(({id,point,label})=><g key={id} role="button" tabIndex={0} aria-label={label} onClick={()=>onSelect(id)} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(id);}}} className={`frontier-mark ${selected===id?'selected':''}`}><circle cx={x(point.annualizedVolatility)} cy={y(point.annualizedReturn)} r="7"><title>{`${label}: Return ${pct(point.annualizedReturn)} · Volatility ${pct(point.annualizedVolatility)} · Sharpe ${numeric(point.historicalSharpe)}`}</title></circle></g>)}
    <text x={width/2} y={height-8} textAnchor="middle">Annualized Volatility</text>
    <text x="14" y={height/2} transform={`rotate(-90 14 ${height/2})`} textAnchor="middle">Annualized Historical Return</text>
  </svg>;
}
