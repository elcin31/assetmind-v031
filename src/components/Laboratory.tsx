import { CapitalSummary } from './CapitalSummary';
import { DataQualityPanel } from './DataQualityPanel';
import { useState } from 'react';
import type { PortfolioSnapshot } from '../types';
import type { AnalyticsController } from '../analytics/usePortfolioAnalytics';
import { AnalyticsMetric, Formula } from './AnalyticsMetric';
import { PortfolioHistoryChart, PeriodSelector } from './PortfolioHistoryChart';
import { MonthlyReturnsHeatmap } from './MonthlyReturnsHeatmap';
import { DrawdownChart } from './DrawdownChart';
import { CorrelationMatrix } from './CorrelationMatrix';
import { BenchmarkPanel } from './BenchmarkPanel';
import { AttributionPanel } from './AttributionPanel';
import { ScenariosPanel } from './ScenariosPanel';
import { AnalyticsChart } from './AnalyticsChart';
import { RiskHorizonSelector } from './RiskHorizonSelector';
import { buildXRayInsights } from '../math/xrayInsights';
import { numeric, pct } from '../utils/analyticsFormat';

const tabs = [
  { id: 'xray', label: 'X-Ray' },
  { id: 'performance', label: 'Доходность' },
  { id: 'risk', label: 'Риск' },
  { id: 'diversification', label: 'Диверсификация' },
  { id: 'benchmark', label: 'Benchmark' },
  { id: 'attribution', label: 'Атрибуция' },
  { id: 'scenarios', label: 'Сценарии' },
];

export function Laboratory({
  snapshot,
  controller: c,
}: {
  snapshot: PortfolioSnapshot;
  controller: AnalyticsController;
}) {
  const [tab, setTab] = useState('xray');
  const [volWindow, setVolWindow] = useState<20 | 60 | 252>(20);
  const [sharpeWindow, setSharpeWindow] = useState<20 | 60 | 252>(20);
  const [selectedCorrelationPeer, setSelectedCorrelationPeer] = useState('');
  const [correlationWindow, setCorrelationWindow] = useState<20 | 60 | 252>(20);
  const [scenarioWeights, setScenarioWeights] = useState<(number | null)[] | null>(null);
  const a = c.analytics;
  const sample = `${a.sample} · Rf ${c.rf}% · MAR ${c.mar}%`;
  const providerReason = c.errors.length ? c.errors.join('; ') : null;
  const matrixReason = providerReason ?? a.riskMatrix.reason;
  const hasMultipleHoldings = snapshot.positions.length > 1;
  const currentRiskReason = !snapshot.valuation.complete
    ? 'Нужны текущие котировки всех открытых позиций для рыночных весов.'
    : !a.matrix
      ? matrixReason
      : 'Вклад в риск математически не определён: portfolio variance должна быть положительной.';
  const diversificationReason = !hasMultipleHoldings ? 'Не применяется к портфелю с одной позицией.' : currentRiskReason;
  const weights = snapshot.positions.map(p => ({
    symbol: p.symbol,
    weight: a.details[p.symbol]?.weight ?? null,
    riskContribution: a.currentRisk?.contributions.find(item => item.symbol === p.symbol)?.normalizedRC ?? null,
    marketValue: p.marketValue,
  })).sort((x, y) => (y.weight ?? -1) - (x.weight ?? -1));
  const concentrationStats = a.concentrationSummary;
  const activeCorrelationPeer = c.correlationExplorer.rows.some(row => row.symbol === selectedCorrelationPeer) || selectedCorrelationPeer === c.benchmark ? selectedCorrelationPeer : '';
  const selectedCorrelationRow = c.correlationExplorer.rows.find(row => row.symbol === activeCorrelationPeer) ?? c.correlationExplorer.rows[0] ?? null;
  const observations = buildXRayInsights({
    positions: weights,
    averagePairwiseCorrelation: a.averageCorrelation,
    currentDrawdown: a.drawdown?.current ?? null,
    maxDrawdown: a.drawdown?.max ?? null,
    riskConcentration: a.currentRisk?.riskConcentration ?? null,
    diversificationRatio: hasMultipleHoldings ? a.currentRisk?.diversificationRatio ?? null : null,
    portfolioBeta: a.currentBenchmarkRisk.beta,
    activeDrawdown: a.relativeDrawdown?.current ?? null,
    commonObservations: a.riskMatrix.commonObservations,
    requiredObservations: a.riskMatrix.required,
    pnlContributions: a.pnl.map(item => ({ symbol: item.symbol, unrealizedPnL: item.unrealizedPnL })),
  });
  const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? 'Недостаточно данных' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: snapshot.portfolio.base_currency, maximumFractionDigits: 0 }).format(value);

  return (
    <>
      <section className="lab-intro">
        <div>
          <span className="eyebrow">АНАЛИТИКА ПОРТФЕЛЯ</span>
          <h2>Laboratory</h2>
          <p>Исследовательский центр структуры, доходности и риска портфеля.</p>
        </div>
      </section>
      <div className="lab-tabs" role="group" aria-label="Раздел аналитики">
        {tabs.map((t) => (
          <button
            key={t.id}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="analytics-settings">
        <label>
          Безрисковая ставка, % в год
          <input
            className="input"
            type="number"
            min="-10"
            max="100"
            step=".25"
            value={c.rf}
            onChange={(e) =>
              c.setRf(Math.max(-10, Math.min(100, Number(e.target.value))))
            }
          />
        </label>
        <label>
          MAR, % в год
          <input
            className="input"
            type="number"
            min="-10"
            max="100"
            step=".25"
            value={c.mar}
            onChange={(e) =>
              c.setMar(Math.max(-10, Math.min(100, Number(e.target.value))))
            }
          />
        </label>
      </div>

      {(tab === 'risk' || tab === 'diversification' || tab === 'xray') && (
        <div className="section-heading">
          <div>
            <h2>Risk Horizon</h2>
            <p className="caption">Одно окно для current-risk, covariance, correlation и diversification. Performance period остаётся независимым.</p>
          </div>
          <RiskHorizonSelector controller={c} />
        </div>
      )}
      {(tab === 'attribution' || tab === 'benchmark') && <PeriodSelector controller={c} />}

      {tab === 'xray' && <>
        <section className="xray-summary">
          <div className="xray-summary-main"><span className="eyebrow">PORTFOLIO X-RAY</span><h2>Портфель под микроскопом</h2><p>{snapshot.positions.length} открытых позиций · данные на {new Date().toLocaleDateString('ru-RU')}</p><strong>{snapshot.valuation.complete ? money(snapshot.accountValue ?? snapshot.portfolioValue) : 'Недостаточно данных'}</strong><small>Стоимость портфеля</small></div>
          <div className="xray-summary-metrics">
            <XRayMetric label="Total Return / TWR · Actual" value={a.performance.twr} percent reason={a.performance.reason ?? 'Требуется фактическая transaction-aware история.'} formula="TWR = ∏(1 + rₜ) − 1" sample={sample} />
            <XRayMetric label="Volatility · Current Holdings" value={a.proxy.volatility} percent reason={a.proxy.riskWindow.reason ?? (!a.proxy.volatility ? 'Риск текущего состава математически не определён.' : null)} formula="σₚ = √(wᵀΣw) × √252" sample={`${c.riskHorizon} · Current Holdings Risk`} />
            <XRayMetric label="Sharpe · Current Holdings" value={a.proxy.sharpe} reason={a.proxy.riskWindow.reason ?? (!a.proxy.sharpe ? 'Sharpe не определён при недостаточной или нулевой волатильности.' : null)} formula="(252 × mean(rₚ) − Rf) / σₚ,ann" sample={`${c.riskHorizon} · Current Holdings Risk`} />
            <XRayMetric label="Actual Max Drawdown" value={a.drawdown?.max} percent reason={a.performance.reason ?? a.riskReason ?? 'Для actual drawdown требуется минимум 20 фактических return-интервалов.'} formula="min(Vₜ / max(V₀…Vₜ) − 1)" sample={sample} />
            <XRayMetric label="Portfolio Beta · Current Holdings" value={a.currentBenchmarkRisk.beta} reason={a.currentBenchmarkRisk.observations < 20 ? `Недостаточно общих benchmark интервалов: ${a.currentBenchmarkRisk.observations}/20.` : null} formula="Cov(rₚ,rᵦ) / Var(rᵦ)" sample={`${a.currentBenchmarkRisk.observations} общих интервалов · ${c.benchmark}`} />
            <XRayMetric label="Holdings Proxy Max Drawdown" value={a.proxy.drawdown?.max} percent reason={a.proxy.drawdownReason} formula="min(Vₜ / max(V₀…Vₜ) − 1), V₀ = 100" sample={`${c.riskHorizon} · Current Holdings; не actual drawdown`} />
            <XRayMetric label="Diversification Ratio" value={hasMultipleHoldings ? a.currentRisk?.diversificationRatio : null} reason={diversificationReason} formula="Σ(wᵢ × σᵢ) / σₚ" sample={a.matrixSample} />
            <XRayMetric label="Effective Holdings" value={a.concentration?.effectivePositions} reason={!a.concentration ? 'Нужны полные текущие рыночные веса.' : null} formula="1 / Σ(wᵢ²)" sample="Текущие рыночные веса" />
          </div>
        </section>
        <section className="xray-grid">
          <article className="card xray-concentration"><div className="section-heading"><div><h2>Концентрация портфеля</h2><p className="caption">Текущие позиции, отсортированные по рыночному весу.</p></div><span className="tag">{weights.length} позиций</span></div>
            {!snapshot.valuation.complete && <p className="notice">Для точных весов нужны текущие котировки всех открытых позиций.</p>}
            <div className="xray-highlights"><div><span>Largest Position</span><b>{concentrationStats?.largestPositionWeight == null ? 'Недостаточно данных' : pct(concentrationStats.largestPositionWeight)}</b></div><div><span>Top 3 Weight</span><b>{concentrationStats ? pct(concentrationStats.top3Weight) : 'Недостаточно данных'}</b></div><div><span>Top 5 Weight</span><b>{concentrationStats ? pct(concentrationStats.top5Weight) : 'Недостаточно данных'}</b></div><div><span>HHI</span><b>{concentrationStats?.hhi == null ? 'Недостаточно данных' : concentrationStats.hhi.toFixed(3)}</b></div></div>
            <div className="xray-bars">{weights.map(p => <div className="xray-bar-row" key={p.symbol}><b>{p.symbol}</b><div className="xray-bar-track"><i style={{ width: `${Math.max(0, Math.min(100, (p.weight ?? 0) * 100))}%` }} /></div><span>{p.weight == null ? '—' : `${(p.weight * 100).toFixed(1)}%`}</span><small>{money(p.marketValue)}</small></div>)}</div>
            <Formula name="HHI и эффективное число позиций" formula="HHI = Σ(wᵢ²) · Effective Holdings = 1 / HHI">Рассчитано по нормированным текущим рыночным весам. HHI близкий к 1 означает большую концентрацию.</Formula>
          </article>
          <article className="card"><div className="section-heading"><div><h2>Структура риска</h2><p className="caption">Вес капитала сравнивается с долей портфельной variance.</p></div><span className="tag">{c.riskHorizon}</span></div>
            {!a.currentRisk && <p className="notice">{currentRiskReason}</p>}
            {a.currentRisk && <div className="xray-risk-list">{weights.map(p => { const rc = p.riskContribution; return <div className="xray-risk-row" key={p.symbol}><b>{p.symbol}</b><span>Вес <strong>{p.weight == null ? '—' : pct(p.weight)}</strong></span><span>Риск <strong>{rc == null ? '—' : pct(rc)}</strong></span><div className="xray-risk-bars"><i style={{ width: `${p.weight == null ? 0 : Math.min(100, Math.max(0, p.weight * 100))}%` }} /><i style={{ width: `${rc == null ? 0 : Math.min(100, Math.max(0, rc * 100))}%` }} /></div></div> })}</div>}
            <p className="caption">Синий — вес; фиолетовый — вклад в variance. Данные: {a.matrixSample}.</p>
          </article>
            <article className="card"><h2>Диверсификация</h2><div className="xray-diversification"><div><span>Number of Holdings</span><b>{snapshot.positions.length}</b></div><div><span>Effective Holdings</span><b>{a.concentration?.effectivePositions?.toFixed(1) ?? 'Недостаточно данных'}</b></div><div><span>Средняя корреляция</span><b>{a.averageCorrelation == null ? 'Недостаточно данных' : a.averageCorrelation.toFixed(2)}</b></div><div><span>Portfolio Volatility</span><b>{a.currentRisk?.volatility == null ? 'Недостаточно данных' : pct(a.currentRisk.volatility)}</b></div><div><span>Weighted Asset Volatility</span><b>{a.currentRisk?.weightedAverageAssetVolatility == null ? 'Недостаточно данных' : pct(a.currentRisk.weightedAverageAssetVolatility)}</b></div><div><span>Risk Horizon</span><b>{c.riskHorizon}</b></div></div>
            <Formula name="Diversification Ratio" formula="DR = Σ(wᵢ × σᵢ) / σₚ">Веса и annualized volatility берутся из одного выбранного окна {c.riskHorizon}; covariance использует общий набор наблюдений.</Formula>
          </article>
          <article className="card"><div className="section-heading"><div><h2>Ключевые наблюдения</h2><p className="caption">Факты, рассчитанные по текущим данным портфеля.</p></div><span className="tag">Deterministic</span></div>
            {observations.length ? <ul className="xray-observations">{observations.map(item => { const target = item.category === 'risk' ? 'risk' : item.category === 'diversification' ? 'diversification' : item.category === 'performance' ? 'performance' : 'attribution'; return <li key={item.id} data-severity={item.severity}><span>{item.title}</span><p>{item.message}</p><button className="text-button" type="button" onClick={() => setTab(target)}>Открыть раздел →</button></li>; })}</ul> : <p className="caption">Пороговые наблюдения не выявлены либо данных пока недостаточно.</p>}
          </article>
          <DataQualityPanel snapshot={snapshot} controller={c} />
        </section>
        <section className="card xray-shortcuts"><div className="section-heading"><div><h2>Перейти к исследованию</h2><p className="caption">Быстрый переход из сводки к аналитическим деталям.</p></div></div><div className="xray-shortcut-list">{[['risk','View Risk Budget'],['risk','Open Drawdown Lab'],['diversification','Explore Correlations'],['benchmark','Compare Benchmark'],['attribution','Open Attribution'],['scenarios','Stress Portfolio'],['scenarios','Run What-if']].map(([target,label],index)=><button key={`${target}-${index}`} className="btn btn-ghost" type="button" onClick={()=>setTab(target)}>{label}</button>)}</div></section>
      </>}

      {tab === 'performance' && a.performance.reason && !c.loading && (
        <p className="notice">{a.performance.reason}</p>
      )}
      {tab === 'risk' && a.riskReason && !c.loading && (
        <p className="notice">{providerReason ?? a.riskReason}</p>
      )}
      {tab === 'performance' && (
        <>
          <PortfolioHistoryChart
            controller={c}
            currency={snapshot.portfolio.base_currency}
          />
          <section className="card">
            <div className="analytics-metrics">
              {(
                [
                  'twr',
                  'cagr',
                  'totalReturn',
                  'bestDay',
                  'worstDay',
                  'positiveDays',
                  'negativeDays',
                ] as const
              ).map((metric) => (
                <AnalyticsMetric
                  key={metric}
                  metric={metric}
                  value={a.performance[metric]}
                  sample={sample}
                  reason={a.performance.reason}
                />
              ))}
            </div>
          </section>
          <CapitalSummary snapshot={snapshot} />
          <MonthlyReturnsHeatmap
            months={a.performance.monthly}
            loading={c.loading}
            sample={sample}
          />
        </>
      )}
      {tab === 'risk' && (
        <>
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Current Holdings Risk</h2>
                <p className="caption">Историческая оценка риска текущего состава портфеля по adjusted returns и сегодняшним рыночным весам. Это не фактическая доходность пользователя.</p>
              </div>
              <span className="tag">{c.riskHorizon} Historical Lookback</span>
            </div>
            {a.proxy.riskWindow.reason && <p className="notice">{a.proxy.riskWindow.reason}</p>}
            <div className="analytics-metrics">
              <AnalyticsMetric metric="volatility" label="Volatility · Current Holdings" value={a.proxy.volatility} sample={`${c.riskHorizon} · ${a.proxy.riskWindow.availableObservations} общих proxy-интервалов`} reason={a.proxy.riskWindow.reason ?? (!a.proxy.volatility ? 'Риск текущего состава математически не определён.' : null)} />
              <AnalyticsMetric metric="sharpe" label="Sharpe · Current Holdings" value={a.proxy.sharpe} sample={`${c.riskHorizon} · Rf ${c.rf}%`} ratio reason={a.proxy.riskWindow.reason ?? (!a.proxy.sharpe ? 'Sharpe не определён при недостаточной или нулевой волатильности.' : null)} />
              <AnalyticsMetric metric="sortino" label="Sortino · Current Holdings" value={a.proxy.sortino} sample={`${c.riskHorizon} · MAR ${c.mar}%`} ratio reason={a.proxy.riskWindow.reason ?? (!a.proxy.sortino ? 'Sortino требует достаточную downside-выборку и ненулевой downside deviation.' : null)} />
              <AnalyticsMetric metric="var95" label="Historical VaR 95% · Current Holdings" value={a.proxy.tail?.var ?? null} sample={`${c.riskHorizon} proxy returns`} reason={a.proxy.riskWindow.reason ?? (a.proxy.riskWindow.availableObservations < 60 ? 'Для исторического VaR 95% нужно минимум 60 наблюдений.' : null)} />
              <AnalyticsMetric metric="es95" label="Expected Shortfall 95% · Current Holdings" value={a.proxy.tail?.es ?? null} sample={`${c.riskHorizon} proxy returns`} reason={a.proxy.riskWindow.reason ?? (a.proxy.riskWindow.availableObservations < 60 ? 'Для Expected Shortfall 95% нужно минимум 60 наблюдений.' : null)} />
              <AnalyticsMetric metric="beta" label="Beta · Current Holdings" value={a.currentBenchmarkRisk.beta} sample={`${a.currentBenchmarkRisk.observations} общих наблюдений · ${c.benchmark}`} ratio reason={a.currentBenchmarkRisk.observations < 20 ? `Недостаточно benchmark overlap: ${a.currentBenchmarkRisk.observations}/20 общих наблюдений.` : null} />
              <AnalyticsMetric metric="benchmarkCorrelation" label="Correlation · Benchmark" value={a.currentBenchmarkRisk.correlation} sample={`${a.currentBenchmarkRisk.observations} общих наблюдений · ${c.benchmark}`} ratio reason={a.currentBenchmarkRisk.observations < 20 ? `Недостаточно benchmark overlap: ${a.currentBenchmarkRisk.observations}/20 общих наблюдений.` : null} />
              <AnalyticsMetric metric="diversificationRatio" value={hasMultipleHoldings ? a.currentRisk?.diversificationRatio : null} sample={a.matrixSample} ratio reason={!hasMultipleHoldings ? diversificationReason : !a.currentRisk ? currentRiskReason : null} />
              <XRayMetric label="Risk Concentration" value={a.currentRisk?.riskConcentration} reason={!a.currentRisk ? currentRiskReason : null} formula="Σ(RCᵢ%²)" sample={a.matrixSample} />
              <AnalyticsMetric metric="maxDrawdown" label="Historical Drawdown · Current Holdings" value={a.proxy.drawdown?.max ?? null} sample={`${c.riskHorizon} common proxy returns`} reason={a.proxy.drawdownReason} />
              <AnalyticsMetric metric="currentDrawdown" label="Current Historical Drawdown · Current Holdings" value={a.proxy.drawdown?.current ?? null} sample={`${c.riskHorizon} common proxy returns`} reason={a.proxy.drawdownReason} />
            </div>
            <Formula name="Модель текущего состава" formula="rₚ,t = Σ wᵢ,current × rᵢ,t; σₚ = √(wᵀΣw)">Для 20D, 60D и 1Y берутся последние общие исторические интервалы доходностей активов. Требуется минимум 20 наблюдений; никакие сделки или исторические количества портфеля не моделируются.</Formula>
          </section>
          <section className="card">
            <div className="section-heading"><div><h2>Actual Portfolio Risk / Performance</h2><p className="caption">Рассчитано по фактической transaction-aware истории портфеля за выбранный период {c.period}.</p></div><span className="tag">Actual history</span></div>
            {a.riskReason && !c.loading ? <div className="notice actual-risk-empty"><strong>Фактическая история пока недостаточна</strong><span>{a.riskReason} Current Holdings Risk выше рассчитан по историческим данным активов.</span></div> : <div className="analytics-metrics">
              {(['volatility', 'sharpe', 'sortino', 'calmar', 'var95', 'es95'] as const).map(metric => <AnalyticsMetric key={metric} metric={metric} label={`${metric === 'volatility' ? 'Volatility' : metric === 'sharpe' ? 'Sharpe' : metric === 'sortino' ? 'Sortino' : metric === 'calmar' ? 'Calmar' : metric === 'var95' ? 'VaR 95%' : 'Expected Shortfall 95%'} · Actual`} value={a.risk[metric]} sample={a.riskSample} ratio={['sharpe', 'sortino', 'calmar'].includes(metric)} reason={metric === 'var95' || metric === 'es95' ? a.tailRiskReason : metric === 'sortino' ? a.sortinoReason : metric === 'calmar' ? a.performance.reason ?? a.riskReason : a.riskReason} />)}
              <AnalyticsMetric metric="maxDrawdown" label="Max Drawdown · Actual" value={a.drawdown?.max ?? null} sample={sample} reason={a.performance.reason ?? a.riskReason} />
              <AnalyticsMetric metric="currentDrawdown" label="Current Drawdown · Actual" value={a.drawdown?.current ?? null} sample={sample} reason={a.performance.reason ?? a.riskReason} />
            </div>}
          </section>
          <section className="card">
            <div className="section-heading"><div><h2>Risk Budget</h2><p className="caption">Вклад каждой позиции в annualized volatility за {c.riskHorizon}.</p></div><span className="tag">Σ normalized RC {a.currentRisk ? pct(a.currentRisk.normalizedRiskContributionSum) : '—'}</span></div>
            {!a.currentRisk && <p className="notice">{currentRiskReason}</p>}
            {a.currentRisk && <>
              <div className="risk-budget-summary"><div><span>Largest Risk Contributor</span><b>{a.currentRisk.largestRiskContributor?.symbol ?? '—'} · {a.currentRisk.largestRiskContributor ? pct(a.currentRisk.largestRiskContributor.contribution) : '—'}</b></div><div><span>Top 3 Risk Contribution</span><b>{pct(a.currentRisk.top3RiskContribution)}</b></div><div><span>Risk Concentration · Σ(RC%²)</span><b>{numeric(a.currentRisk.riskConcentration)}</b></div></div>
              <div className="risk-budget-legend"><span><i /> Weight</span><span><i /> Risk Contribution %</span></div>
              <div className="risk-budget-list">{a.currentRisk.contributions.map(item => <div className="risk-budget-row" key={item.symbol}><b>{item.symbol}</b><div className="risk-budget-bars" title={`${item.symbol}: Weight ${pct(item.weight)} · Risk contribution ${pct(item.normalizedRC)}`}><i style={{ width: `${Math.min(100, Math.abs(item.weight) * 100)}%` }} /><i style={{ width: `${Math.min(100, Math.abs(item.normalizedRC) * 100)}%`, background: item.normalizedRC < 0 ? 'var(--negative)' : undefined }} /></div><span>{pct(item.weight)}</span><strong>{pct(item.normalizedRC)}</strong></div>)}</div>
              <div className="table-scroll"><table><thead><tr><th>Актив</th><th>Вес</th><th>Asset Volatility</th><th>MCRᵢ</th><th>RCᵢ</th><th>RC %</th><th>Risk / Weight</th></tr></thead><tbody>{a.currentRisk.contributions.map(item => <tr key={item.symbol}><td>{item.symbol}</td><td>{pct(item.weight)}</td><td>{pct(item.assetVolatility)}</td><td>{pct(item.mcr)}</td><td>{pct(item.rc)}</td><td>{pct(item.normalizedRC)}</td><td>{item.riskWeightRatio == null ? 'Недостаточно данных' : numeric(item.riskWeightRatio)}</td></tr>)}</tbody></table></div>
              <Formula name="Risk Budget" formula="MCRᵢ=(Σw)ᵢ/σₚ; RCᵢ=wᵢ×MCRᵢ; normalized RCᵢ=RCᵢ/σₚ">Доля normalized RC суммируется примерно до 100%. Хеджирующие позиции могут иметь отрицательный вклад. Risk concentration — сумма квадратов долей normalized RC, не прогноз и не рекомендация.</Formula>
            </>}
          </section>
          <DrawdownChart analytics={a} loading={c.loading} />
          <section className="card">
            <div className="section-heading">
              <div><h2>Скользящая волатильность</h2><p className="caption">Исторический rolling-график использует отдельный performance period: {c.period}.</p></div>
              <PeriodSelector controller={c} />
            </div>
            <div className="chart-periods" aria-label="Окно волатильности">
              {([20, 60, 252] as const).map((n) => (
                <button key={n} aria-pressed={volWindow === n} onClick={() => setVolWindow(n)}>{n}D</button>
              ))}
            </div>
            <AnalyticsChart key={`vol-${volWindow}-${c.period}`} points={a.rolling.volatility[volWindow]} label="Скользящая волатильность" format={pct} loading={c.loading} reason={providerReason ?? a.riskReason} />
            <Formula name="Окно волатильности" formula="σ_window = stdev_sample(r_window) × √252">
              Нужно полное окно из {volWindow} чистых доходностей. Участок до накопления окна и окна, пересекающие исключённый trade/gap интервал, не выдумываются. Данные: {sample}.
            </Formula>
          </section>
          <section className="card">
            <h2>Скользящий Sharpe</h2>
            <div className="chart-periods" aria-label="Окно Sharpe">
              {([20, 60, 252] as const).map((n) => (
                <button key={n} aria-pressed={sharpeWindow === n} onClick={() => setSharpeWindow(n)}>{n}D</button>
              ))}
            </div>
            <AnalyticsChart key={`sharpe-${sharpeWindow}-${c.period}`} points={a.rolling.sharpe[sharpeWindow]} label="Скользящий Sharpe" format={(v) => v.toFixed(2)} loading={c.loading} reason={providerReason ?? a.riskReason} />
            <Formula name="Окно Sharpe" formula="Sharpe=(252×mean(r)−Rf_annual)/σ_annual">
              Полное окно {sharpeWindow} чистых доходностей, Rf {c.rf}% в год. При нулевой волатильности участок недоступен. Данные: {sample}.
            </Formula>
          </section>
        </>
      )}
      {tab === 'diversification' && (
        <>
          <section className="card">
            <div className="section-heading"><div><h2>Diversification Overview</h2><p className="caption">Капитал, совместный риск и концентрация risk contributions · {c.riskHorizon}.</p></div><span className="tag">{c.riskHorizon}</span></div>
            <div className="analytics-metrics">
              <XRayMetric label="Actual Holdings" value={snapshot.positions.length} formula="Количество открытых позиций" sample="Текущий портфель" />
              <XRayMetric label="Effective Holdings" value={a.concentration?.effectivePositions} formula="1 / Σ(wᵢ²)" sample="Текущие рыночные веса" />
              <AnalyticsMetric metric="diversificationRatio" value={hasMultipleHoldings ? a.currentRisk?.diversificationRatio : null} sample={a.matrixSample} ratio reason={!hasMultipleHoldings ? diversificationReason : !a.currentRisk ? currentRiskReason : null} />
              <AnalyticsMetric metric="averageCorrelation" value={a.averageCorrelation} sample={a.matrixSample} ratio reason={!a.matrix ? matrixReason : null} />
              <XRayMetric label="Largest Position Weight" value={a.concentrationSummary?.largestPositionWeight} percent formula="max(wᵢ)" sample="Текущие рыночные веса" />
              <XRayMetric label="Top 3 Weight" value={a.concentrationSummary?.top3Weight} percent formula="Σ веса трёх крупнейших позиций" sample="Текущие рыночные веса" />
              <XRayMetric label="Largest Risk Contributor" value={a.currentRisk?.largestRiskContributor?.contribution} percent reason={!a.currentRisk ? currentRiskReason : null} formula="max(normalized RCᵢ)" sample={a.matrixSample} />
              <XRayMetric label="Portfolio Volatility" value={a.currentRisk?.volatility} percent reason={!a.currentRisk ? currentRiskReason : null} formula="√(wᵀΣw)" sample={a.matrixSample} />
              <XRayMetric label="Weighted Asset Volatility" value={a.currentRisk?.weightedAverageAssetVolatility} percent reason={!a.currentRisk ? currentRiskReason : null} formula="Σ(wᵢ × σᵢ)" sample={a.matrixSample} />
            </div>
          </section>
          <section className="card">
            {!a.matrix && <p className="notice">{matrixReason}</p>}
            <div className="analytics-metrics">
              <AnalyticsMetric metric="covarianceVol" value={a.currentRisk?.volatility} sample={a.matrixSample} reason={!a.currentRisk ? currentRiskReason : null} />
              <AnalyticsMetric metric="diversificationRatio" value={hasMultipleHoldings ? a.currentRisk?.diversificationRatio : null} sample={a.matrixSample} ratio reason={!hasMultipleHoldings ? diversificationReason : !a.currentRisk ? currentRiskReason : null} />
              <AnalyticsMetric metric="averageCorrelation" value={a.averageCorrelation} sample={a.matrixSample} ratio reason={!a.matrix ? matrixReason : null} />
              <AnalyticsMetric metric="hhi" value={a.concentration?.hhi} sample="текущие рыночные веса" ratio />
              <AnalyticsMetric metric="effectivePositions" value={a.concentration?.effectivePositions} sample="текущие рыночные веса" ratio />
            </div>
          </section>
          <section className="card correlation-explorer">
            <div className="section-heading"><div><h2>Correlation Explorer</h2><p className="caption">Корреляции текущего risk window и rolling pair correlations за доступную историю.</p></div><label>Выбранный актив<select className="input" value={c.selectedCorrelationAsset} onChange={event => { c.setSelectedCorrelationAsset(event.target.value); setSelectedCorrelationPeer(''); }}>{snapshot.positions.map(position => <option key={position.symbol} value={position.symbol}>{position.symbol}</option>)}</select></label></div>
            {!a.matrix || !hasMultipleHoldings ? <p className="notice">{hasMultipleHoldings ? matrixReason : 'Correlation Explorer requires at least two holdings.'}</p> : <>
              <div className="risk-budget-summary"><div><span>Highest Correlation</span><b>{c.correlationExplorer.highest ? `${c.correlationExplorer.highest.symbol} · ${numeric(c.correlationExplorer.highest.value)}` : 'Недостаточно данных'}</b></div><div><span>Lowest Correlation</span><b>{c.correlationExplorer.lowest ? `${c.correlationExplorer.lowest.symbol} · ${numeric(c.correlationExplorer.lowest.value)}` : 'Недостаточно данных'}</b></div><div><span>Benchmark · {c.benchmark}</span><b>{c.correlationExplorer.benchmark?.value == null ? 'Недостаточно данных' : numeric(c.correlationExplorer.benchmark.value)}</b></div></div>
              <div className="table-scroll"><table><thead><tr><th>Пара</th><th>Correlation</th><th>Observations</th><th>Rolling detail</th></tr></thead><tbody>{c.correlationExplorer.rows.map(row => <tr key={row.symbol}><td>{c.selectedCorrelationAsset} / {row.symbol}</td><td>{row.value == null ? 'Недостаточно данных' : numeric(row.value)}</td><td>{row.observations}</td><td><button className="btn btn-ghost" aria-pressed={activeCorrelationPeer === row.symbol || (!activeCorrelationPeer && selectedCorrelationRow?.symbol === row.symbol)} onClick={() => setSelectedCorrelationPeer(row.symbol)}>Открыть</button></td></tr>)}{c.correlationExplorer.benchmark && <tr><td>{c.selectedCorrelationAsset} / {c.benchmark}</td><td>{c.correlationExplorer.benchmark.value == null ? 'Недостаточно данных' : numeric(c.correlationExplorer.benchmark.value)}</td><td>{c.correlationExplorer.benchmark.observations}</td><td><button className="btn btn-ghost" aria-pressed={activeCorrelationPeer === c.benchmark} onClick={() => setSelectedCorrelationPeer(c.benchmark)}>Открыть</button></td></tr>}</tbody></table></div>
              <div className="chart-periods" aria-label="Rolling correlation window">{([20, 60, 252] as const).map(n => <button key={n} aria-pressed={correlationWindow === n} onClick={() => setCorrelationWindow(n)}>{n}D</button>)}</div>
              <AnalyticsChart points={(activeCorrelationPeer === c.benchmark ? c.correlationExplorer.benchmark?.rolling[correlationWindow] ?? [] : selectedCorrelationRow?.rolling[correlationWindow] ?? []).map(point => ({ ...point, caption: `${correlationWindow}D · ${point.observations} observations` }))} label={`Rolling correlation ${c.selectedCorrelationAsset} / ${activeCorrelationPeer || selectedCorrelationRow?.symbol || 'asset'}`} format={numeric} loading={c.loading} reason={`Недостаточно ${correlationWindow} общих последовательных наблюдений для rolling correlation.`} />
              <Formula name="Correlation Explorer" formula="ρ(A,B)=Cov(RA,RB)/(σAσB)">Current correlation использует общую выборку текущего risk window {c.riskHorizon} ({a.riskMatrix.commonObservations} observations). Rolling correlation использует {correlationWindow} точных общих последовательных дневных интервалов; пропуски не заполняются.</Formula>
            </>}
          </section>
          <CorrelationMatrix matrix={a.matrix} loading={c.loading} reason={matrixReason} />
          <section className="card">
            <div className="section-heading"><h2>Вклад в риск текущего состава</h2><span className="tag">{c.riskHorizon}</span></div>
            {!a.currentRisk && <p className="notice">{currentRiskReason}</p>}
            <div className="table-scroll">
              <table>
                <thead><tr><th>Актив</th><th>Вес</th><th>Доля variance</th><th>MCR = (Σw)ᵢ</th><th>RC = wᵢMCRᵢ</th></tr></thead>
                <tbody>
                  {a.currentRisk?.contributions.map((item) => (
                    <tr key={item.symbol}>
                      <td>{item.symbol}</td><td>{pct(item.weight)}</td><td>{pct(item.fraction)}</td><td>{item.marginal.toFixed(6)}</td><td>{item.absolute.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Formula name="Разложение variance" formula="σp²=w′Σw; MCRᵢ=(Σw)ᵢ; RCᵢ=wᵢMCRᵢ; shareᵢ=RCᵢ/σp²">
              Годовая covariance matrix построена по одной и той же выборке из последних {a.riskMatrix.required} общих return-интервалов для всех активов. ΣRCᵢ = σp², а сумма долей RC равна 1 с численной погрешностью. Отрицательный вклад возможен у хеджирующего актива. Данные: {a.matrixSample}.
            </Formula>
          </section>
        </>
      )}
      {tab === 'attribution' && <AttributionPanel analytics={a} currency={snapshot.portfolio.base_currency} positions={snapshot.positions} />}
      {tab === 'scenarios' && <ScenariosPanel snapshot={snapshot} controller={c} weights={scenarioWeights} onWeightsChange={setScenarioWeights} />}
      {tab === 'benchmark' && <BenchmarkPanel controller={c} detailed />}
      {tab !== 'xray' && <LaboratoryDataContext snapshot={snapshot} controller={c} />}
    </>
  );
}

function LaboratoryDataContext({ snapshot, controller: c }: { snapshot: PortfolioSnapshot; controller: AnalyticsController }) {
  const a = c.analytics;
  const latestPriceDate = a.dataQuality.latestPriceDate;
  return <details className="card lab-data-context"><summary>Data Quality &amp; Methodology <span>{c.riskHorizon} · {a.riskMatrix.commonObservations} common observations</span></summary><div className="data-quality-grid"><div><span>Risk Window</span><b>{c.riskHorizon}</b></div><div><span>Covariance observations</span><b>{a.riskMatrix.commonObservations}/{a.riskMatrix.required}</b></div><div><span>Benchmark overlap · {c.benchmark}</span><b>{a.currentBenchmarkRisk.observations}</b></div><div><span>Price coverage</span><b>{snapshot.valuation.pricedPositions}/{snapshot.valuation.totalPositions}</b></div><div><span>Missing symbols</span><b>{snapshot.valuation.unpricedSymbols.length ? snapshot.valuation.unpricedSymbols.join(', ') : 'None reported'}</b></div><div><span>Missing intervals</span><b>{a.history.missingDates.length}</b></div><div><span>Last available price date</span><b>{latestPriceDate ?? 'Недостаточно данных'}</b></div><div><span>Optimization observations</span><b>{a.riskMatrix.matrix?.observations ?? 'Недостаточно данных'}</b></div><div><span>Historical scenario windows</span><b>{a.historicalReplay.map((item) => item.window).join(', ') || 'Unavailable'}</b></div></div>{!a.matrix && <p className="caption">{a.riskMatrix.reason}</p>}</details>;
}

function XRayMetric({ label, value, percent = false, reason, formula, sample }: { label: string; value: number | null | undefined; percent?: boolean; reason?: string | null; formula: string; sample: string }) {
  const display = value == null || !Number.isFinite(value) ? 'Недоступно' : percent ? pct(value) : numeric(value);
  return <div className="xray-summary-metric"><span>{label}</span><b title={value == null ? reason ?? undefined : undefined}>{display}</b><small>{value == null ? reason ?? 'Недостаточно данных для расчёта.' : sample}</small><details className="xray-metric-details"><summary>Подробнее</summary><code>{formula}</code><p>{reason ?? 'Рассчитано по детерминированной analytics-модели.'} Данные: {sample}.</p></details></div>;
}
