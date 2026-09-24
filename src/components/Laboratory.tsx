import { CapitalSummary } from './CapitalSummary';
import { DataQualityPanel } from './DataQualityPanel';
import { useState } from 'react';
import type { PortfolioSnapshot } from '../types';
import type { AnalyticsController } from '../analytics/usePortfolioAnalytics';
import { AnalyticsMetric, Formula } from './AnalyticsMetric';
import { pct } from '../utils/analyticsFormat';
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

const tabs = [
  { id: 'performance', label: 'Доходность' },
  { id: 'risk', label: 'Риск' },
  { id: 'diversification', label: 'Диверсификация' },
  { id: 'attribution', label: 'Атрибуция' },
  { id: 'scenarios', label: 'Сценарии' },
  { id: 'benchmark', label: 'Рынок' },
  { id: 'data', label: 'Данные' },
];

export function Laboratory({
  snapshot,
  controller: c,
}: {
  snapshot: PortfolioSnapshot;
  controller: AnalyticsController;
}) {
  const [tab, setTab] = useState('performance');
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

  return (
    <>
      <section className="lab-intro">
        <div>
          <span className="eyebrow">АНАЛИТИКА ПОРТФЕЛЯ</span>
          <h2>Аналитика</h2>
          <p>Результат, источники риска и сценарии.</p>
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

      {(tab === 'risk' || tab === 'diversification') && (
        <div className="section-heading">
          <div>
            <h2>Risk Horizon</h2>
            <p className="caption">Одно окно для current-risk, covariance, correlation и diversification. Performance period остаётся независимым.</p>
          </div>
          <RiskHorizonSelector controller={c} />
        </div>
      )}
      {(tab === 'attribution' || tab === 'benchmark') && <PeriodSelector controller={c} />}

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
      {tab === 'data' && <DataQualityPanel snapshot={snapshot} controller={c} />}
      {tab === 'benchmark' && <BenchmarkPanel controller={c} detailed />}
    </>
  );
}
