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
import { rollingMetric } from '../math/rolling';
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
  const [volWindow, setVolWindow] = useState(20);
  const [sharpeWindow, setSharpeWindow] = useState(63);
  const a = c.analytics;
  const sample = `${a.sample} · Rf ${c.rf}% · MAR ${c.mar}%`;
  const vol =
    tab === 'risk'
      ? rollingMetric(a.performance.riskReturns, volWindow, 'volatility')
      : [];
  const rollingSharpe =
    tab === 'risk'
      ? rollingMetric(
          a.performance.riskReturns,
          sharpeWindow,
          'sharpe',
          c.rf / 100,
        )
      : [];
  const providerReason = c.errors.length ? c.errors.join('; ') : null;
  const matrixReason = providerReason ?? a.riskMatrix.reason;
  const currentRiskReason = !snapshot.valuation.complete
    ? 'Нужны текущие котировки всех открытых позиций для рыночных весов.'
    : !a.matrix
      ? matrixReason
      : 'Вклад в риск математически не определён: portfolio variance должна быть положительной.';
  const weights = snapshot.positions.map(p => ({
    symbol: p.symbol,
    weight: a.details[p.symbol]?.weight ?? null,
    riskContribution: a.currentRisk?.contributions.find(item => item.symbol === p.symbol)?.fraction ?? null,
    marketValue: p.marketValue,
  })).sort((x, y) => (y.weight ?? -1) - (x.weight ?? -1));
  const concentrationStats = a.concentrationSummary;
  const observations = buildXRayInsights({
    positions: weights,
    averagePairwiseCorrelation: a.averageCorrelation,
    currentDrawdown: a.drawdown?.current ?? null,
    maxDrawdown: a.drawdown?.max ?? null,
    commonObservations: a.riskMatrix.commonObservations,
    requiredObservations: a.riskMatrix.required,
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
            <XRayMetric label="Total Return / TWR" value={a.performance.twr} percent reason={a.performance.reason} formula="TWR = ∏(1 + rₜ) − 1" sample={sample} />
            <XRayMetric label="Волатильность" value={a.risk.volatility} percent reason={a.riskReason} formula="σ annual = stdev(r) × √252" sample={a.riskSample} />
            <XRayMetric label="Sharpe Ratio" value={a.risk.sharpe} reason={a.riskReason} formula="(252 × mean(r) − Rf) / σ annual" sample={a.riskSample} />
            <XRayMetric label="Max Drawdown" value={a.drawdown?.max} percent reason={a.performance.reason} formula="min(Vₜ / max(V₀…Vₜ) − 1)" sample={sample} />
            <XRayMetric label="Portfolio Beta" value={a.benchmark.beta} reason={a.benchmark.observations < 20 ? 'Недостаточно общих наблюдений с benchmark.' : null} formula="Cov(rₚ, rᵦ) / Var(rᵦ)" sample={`${a.benchmark.observations} benchmark observations`} />
            <XRayMetric label="Diversification Ratio" value={a.currentRisk?.diversificationRatio} reason={currentRiskReason} formula="Σ(wᵢ × σᵢ) / σₚ" sample={a.matrixSample} />
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
            {observations.length ? <ul className="xray-observations">{observations.map(item => <li key={item.id} data-severity={item.severity}><span>{item.title}</span><p>{item.message}</p></li>)}</ul> : <p className="caption">Пороговые наблюдения не выявлены либо данных пока недостаточно.</p>}
          </article>
          <DataQualityPanel snapshot={snapshot} controller={c} />
        </section>
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
                <h2>{c.riskHorizon} Risk · фактический портфель</h2>
                <p className="caption">Transaction-aware risk требует полного выбранного окна. BUY/SELL, неизвестный external flow и ценовые gaps не перескакиваются ради добора выборки.</p>
              </div>
              <span className="tag">{c.riskHorizon}</span>
            </div>
            {c.riskHorizon === '20D' && <p className="caption">20D Sharpe чувствителен к короткой выборке.</p>}
            <div className="analytics-metrics">
              {(
                [
                  'volatility',
                  'downside',
                  'sharpe',
                  'sortino',
                  'calmar',
                  'var95',
                  'es95',
                ] as const
              ).map((metric) => (
                <AnalyticsMetric
                  key={metric}
                  metric={metric}
                  value={a.risk[metric]}
                  sample={metric === 'calmar' ? sample : a.riskSample}
                  ratio={['sharpe', 'sortino', 'calmar'].includes(metric)}
                  reason={
                    providerReason ??
                    (metric === 'var95' || metric === 'es95'
                      ? a.tailRiskReason
                      : metric === 'sortino'
                        ? a.sortinoReason
                        : metric === 'calmar'
                          ? (a.performance.reason ?? a.riskReason)
                          : a.riskReason)
                  }
                />
              ))}
              <AnalyticsMetric
                metric="maxDrawdown"
                value={a.drawdown?.max}
                sample={sample}
                reason={providerReason ?? a.performance.reason}
              />
              <AnalyticsMetric
                metric="currentDrawdown"
                value={a.drawdown?.current}
                sample={sample}
                reason={providerReason ?? a.performance.reason}
              />
            </div>
            <Formula
              name={`${c.riskHorizon} annualized volatility`}
              formula="σ_daily = stdev_sample(r); σ_annual = σ_daily × √252"
            >
              Оценка annualized, рассчитанная только по выбранному окну {c.riskHorizon}; это не «годовая история», если выбрано 20D или 60D. Данные: {a.riskSample}.
            </Formula>
          </section>
          <DrawdownChart analytics={a} loading={c.loading} />
          <section className="card">
            <div className="section-heading">
              <div><h2>Скользящая волатильность</h2><p className="caption">Исторический rolling-график использует отдельный performance period: {c.period}.</p></div>
              <PeriodSelector controller={c} />
            </div>
            <div className="chart-periods" aria-label="Окно волатильности">
              {[20, 60, 252].map((n) => (
                <button key={n} aria-pressed={volWindow === n} onClick={() => setVolWindow(n)}>{n}D</button>
              ))}
            </div>
            <AnalyticsChart key={`vol-${volWindow}-${c.period}`} points={vol} label="Скользящая волатильность" format={pct} loading={c.loading} reason={providerReason ?? a.riskReason} />
            <Formula name="Окно волатильности" formula="σ_window = stdev_sample(r_window) × √252">
              Нужно полное окно из {volWindow} чистых доходностей. Участок до накопления окна и окна, пересекающие исключённый trade/gap интервал, не выдумываются. Данные: {sample}.
            </Formula>
          </section>
          <section className="card">
            <h2>Скользящий Sharpe</h2>
            <div className="chart-periods" aria-label="Окно Sharpe">
              {[63, 126, 252].map((n) => (
                <button key={n} aria-pressed={sharpeWindow === n} onClick={() => setSharpeWindow(n)}>{n}D</button>
              ))}
            </div>
            <AnalyticsChart key={`sharpe-${sharpeWindow}-${c.period}`} points={rollingSharpe} label="Скользящий Sharpe" format={(v) => v.toFixed(2)} loading={c.loading} reason={providerReason ?? a.riskReason} />
            <Formula name="Окно Sharpe" formula="Sharpe=(252×mean(r)−Rf_annual)/σ_annual">
              Полное окно {sharpeWindow} чистых доходностей, Rf {c.rf}% в год. При нулевой волатильности участок недоступен. Данные: {sample}.
            </Formula>
          </section>
          <section className="card">
            <div className="section-heading">
              <div><h2>Исторический риск текущего состава · proxy</h2><p className="caption">Как сегодняшний состав портфеля вёл бы себя на прошлых adjusted close. Это модель, не фактическая доходность портфеля.</p></div>
              <span className="tag">{c.riskHorizon} Risk</span>
            </div>
            {a.proxy.riskWindow.reason && <p className="notice">{a.proxy.riskWindow.reason}</p>}
            <div className="analytics-metrics">
              <AnalyticsMetric metric="volatility" value={a.proxy.volatility} sample={`${c.riskHorizon} · ${a.proxy.riskWindow.availableObservations}/${a.proxy.riskWindow.required} proxy-интервалов`} reason={a.proxy.riskWindow.reason} />
              <AnalyticsMetric metric="sharpe" value={a.proxy.sharpe} sample={`${c.riskHorizon} proxy · Rf ${c.rf}%`} ratio reason={a.proxy.riskWindow.reason} />
              <AnalyticsMetric metric="maxDrawdown" value={a.proxy.drawdown?.max} sample="полная proxy value series; не Risk Horizon" />
            </div>
            <Formula name="Текущие количества" formula="V_proxy(t) = Σqᵢ(today)Pᵢ(t)">
              Фиксированные сегодняшние количества. Доходности считаются только на return-интервалах, где у каждого актива есть обе цены start/end; пропуск не превращается в 0 и не создаёт мост через дату. Для {c.riskHorizon} current-risk требуется полное окно из {a.proxy.riskWindow.required} валидных интервалов.
            </Formula>
          </section>
        </>
      )}
      {tab === 'diversification' && (
        <>
          <section className="card">
            {!a.matrix && <p className="notice">{matrixReason}</p>}
            <div className="analytics-metrics">
              <AnalyticsMetric metric="covarianceVol" value={a.currentRisk?.volatility} sample={a.matrixSample} reason={!a.currentRisk ? currentRiskReason : null} />
              <AnalyticsMetric metric="diversificationRatio" value={a.currentRisk?.diversificationRatio} sample={a.matrixSample} ratio reason={!a.currentRisk ? currentRiskReason : null} />
              <AnalyticsMetric metric="averageCorrelation" value={a.averageCorrelation} sample={a.matrixSample} ratio reason={!a.matrix ? matrixReason : null} />
              <AnalyticsMetric metric="hhi" value={a.concentration?.hhi} sample="текущие рыночные веса" ratio />
              <AnalyticsMetric metric="effectivePositions" value={a.concentration?.effectivePositions} sample="текущие рыночные веса" ratio />
            </div>
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
      {tab === 'attribution' && <AttributionPanel analytics={a} currency={snapshot.portfolio.base_currency} />}
      {tab === 'scenarios' && <ScenariosPanel snapshot={snapshot} />}
      {tab === 'benchmark' && <BenchmarkPanel controller={c} detailed />}
    </>
  );
}

function XRayMetric({ label, value, percent = false, reason, formula, sample }: { label: string; value: number | null | undefined; percent?: boolean; reason?: string | null; formula: string; sample: string }) {
  const display = value == null || !Number.isFinite(value) ? 'Недостаточно данных' : percent ? pct(value) : numeric(value);
  return <div className="xray-summary-metric"><span>{label}<Formula name={label} formula={formula}>{reason ?? 'Метрика рассчитана из существующего analytics layer.'} Данные: {sample}.</Formula></span><b title={value == null ? reason ?? undefined : undefined}>{display}</b></div>;
}
