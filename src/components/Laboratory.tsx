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
import { rollingMetric } from '../math/rolling';

const tabs = [
  { id: 'performance', label: 'Доходность' },
  { id: 'risk', label: 'Риск' },
  { id: 'diversification', label: 'Диверсификация' },
  { id: 'attribution', label: 'Атрибуция' },
  { id: 'scenarios', label: 'Сценарии' },
  { id: 'benchmark', label: 'Рынок' },
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
  const matrixReason =
    providerReason ??
    (a.history.missingSymbols.length
      ? `Нет полной рыночной истории: ${a.history.missingSymbols.join(', ')}.`
      : `Нужно минимум 20 строго общих return-интервалов и ненулевая дисперсия каждого актива. Сейчас: ${a.matrix?.observations ?? 0}.`);
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
          <h2>Лаборатория</h2>
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
      {tab !== 'performance' && <PeriodSelector controller={c} />}
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
            <h2>Риск исторического портфеля</h2>
            <p className="caption">
              Risk statistics используют чистые однодневные market-return
              интервалы. Интервалы с BUY/SELL или ценовым gap исключаются без
              нулей и без соединения через разрыв.
            </p>
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
                  sample={sample}
                  ratio={['sharpe', 'sortino', 'calmar'].includes(metric)}
                  reason={
                    providerReason ??
                    (metric === 'sortino'
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
          </section>
          <DrawdownChart analytics={a} loading={c.loading} />
          <section className="card">
            <h2>Скользящая волатильность</h2>
            <div className="chart-periods" aria-label="Окно волатильности">
              {[20, 60, 252].map((n) => (
                <button
                  key={n}
                  aria-pressed={volWindow === n}
                  onClick={() => setVolWindow(n)}
                >
                  {n}D
                </button>
              ))}
            </div>
            <AnalyticsChart
              key={`vol-${volWindow}-${c.period}`}
              points={vol}
              label="Скользящая волатильность"
              format={pct}
              loading={c.loading}
              reason={providerReason ?? a.riskReason}
            />
            <Formula
              name="Окно волатильности"
              formula="σ_window = stdev_sample(r_window) × √252"
            >
              Нужно полное окно из {volWindow} чистых доходностей. Участок до
              накопления окна и окна, пересекающие исключённый trade/gap
              интервал, не выдумываются. Данные: {sample}.
            </Formula>
          </section>
          <section className="card">
            <h2>Скользящий Sharpe</h2>
            <div className="chart-periods" aria-label="Окно Sharpe">
              {[63, 126, 252].map((n) => (
                <button
                  key={n}
                  aria-pressed={sharpeWindow === n}
                  onClick={() => setSharpeWindow(n)}
                >
                  {n}D
                </button>
              ))}
            </div>
            <AnalyticsChart
              key={`sharpe-${sharpeWindow}-${c.period}`}
              points={rollingSharpe}
              label="Скользящий Sharpe"
              format={(v) => v.toFixed(2)}
              loading={c.loading}
              reason={providerReason ?? a.riskReason}
            />
            <Formula
              name="Окно Sharpe"
              formula="Rf_daily=(1+Rf_annual)^(1/252)−1; Sharpe=252×mean(r−Rf_daily)/σ_annual"
            >
              Полное окно {sharpeWindow} чистых доходностей, Rf {c.rf}% в год.
              При нулевой волатильности участок недоступен. Данные: {sample}.
            </Formula>
          </section>
          <section className="card">
            <h2>Исторический риск текущего состава · proxy</h2>
            <p className="caption">
              Как сегодняшний состав портфеля вёл бы себя на прошлых adjusted
              close. Это модель, не фактическая доходность портфеля.
            </p>
            <div className="analytics-metrics">
              <AnalyticsMetric
                metric="volatility"
                value={a.proxy.volatility}
                sample={`${a.proxy.dailyReturns.length} строго общих proxy-интервалов`}
              />
              <AnalyticsMetric
                metric="sharpe"
                value={a.proxy.sharpe}
                sample={`proxy · Rf ${c.rf}%`}
                ratio
              />
              <AnalyticsMetric
                metric="maxDrawdown"
                value={a.proxy.drawdown?.max}
                sample="proxy value series"
              />
            </div>
            <Formula
              name="Текущие количества"
              formula="V_proxy(t) = Σqᵢ(today)Pᵢ(t)"
            >
              Фиксированные сегодняшние количества. Доходности считаются только
              на return-интервалах, где у каждого актива есть обе цены start/end;
              пропуск не превращается в 0 и не создаёт мост через дату. Для
              коэффициентов минимум 20 доходностей.
            </Formula>
          </section>
        </>
      )}
      {tab === 'diversification' && (
        <>
          <section className="card">
            <div className="analytics-metrics">
              <AnalyticsMetric
                metric="covarianceVol"
                value={a.currentRisk?.volatility}
                sample={`${a.matrix?.observations ?? 0} общих интервалов`}
                reason={!a.currentRisk ? currentRiskReason : null}
              />
              <AnalyticsMetric
                metric="diversificationRatio"
                value={a.currentRisk?.diversificationRatio}
                sample={sample}
                ratio
                reason={!a.currentRisk ? currentRiskReason : null}
              />
              <AnalyticsMetric
                metric="averageCorrelation"
                value={a.averageCorrelation}
                sample={sample}
                ratio
                reason={!a.matrix ? matrixReason : null}
              />
              <AnalyticsMetric
                metric="hhi"
                value={a.concentration?.hhi}
                sample="текущие рыночные веса"
                ratio
              />
              <AnalyticsMetric
                metric="effectivePositions"
                value={a.concentration?.effectivePositions}
                sample="текущие рыночные веса"
                ratio
              />
            </div>
          </section>
          <CorrelationMatrix
            matrix={a.matrix}
            loading={c.loading}
            reason={matrixReason}
          />
          <section className="card">
            <h2>Вклад в риск текущего состава</h2>
            {!a.currentRisk && <p className="notice">{currentRiskReason}</p>}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Актив</th>
                    <th>Вес</th>
                    <th>Доля variance</th>
                    <th>MCR = (Σw)ᵢ</th>
                    <th>RC = wᵢMCRᵢ</th>
                  </tr>
                </thead>
                <tbody>
                  {a.currentRisk?.contributions.map((c) => (
                    <tr key={c.symbol}>
                      <td>{c.symbol}</td>
                      <td>{pct(c.weight)}</td>
                      <td>{pct(c.fraction)}</td>
                      <td>{c.marginal.toFixed(6)}</td>
                      <td>{c.absolute.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Formula
              name="Разложение variance"
              formula="σp²=w′Σw; MCRᵢ=(Σw)ᵢ; RCᵢ=wᵢMCRᵢ; shareᵢ=RCᵢ/σp²"
            >
              Годовая covariance matrix и текущие рыночные веса. ΣRCᵢ = σp²,
              а сумма долей RC равна 1 с численной погрешностью. Отрицательный
              вклад возможен у хеджирующего актива. Данные:{' '}
              {a.matrix?.observations ?? 0} общих интервалов.
            </Formula>
          </section>
        </>
      )}
      {tab === 'attribution' && (
        <AttributionPanel
          analytics={a}
          currency={snapshot.portfolio.base_currency}
        />
      )}
      {tab === 'scenarios' && <ScenariosPanel snapshot={snapshot} />}
      {tab === 'benchmark' && <BenchmarkPanel controller={c} detailed />}
    </>
  );
}
