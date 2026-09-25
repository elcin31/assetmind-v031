import type { AnalyticsController } from '../analytics/usePortfolioAnalytics';
import { BenchmarkSelector } from './BenchmarkSelector';
import { AnalyticsChart } from './AnalyticsChart';
import { AnalyticsMetric, Formula } from './AnalyticsMetric';
import { PortfolioIntelligencePanel } from './PortfolioIntelligencePanel';
import { numeric } from '../utils/analyticsFormat';
import { useState } from 'react';

export function BenchmarkPanel({
  controller: c,
  detailed = false,
}: {
  controller: AnalyticsController;
  detailed?: boolean;
}) {
  const [window, setWindow] = useState<20 | 60 | 252>(20);
  const b = c.analytics.benchmark;
  const sample = `${b.observations} строго общих интервалов · ${c.analytics.sample} · Rf ${c.rf}%`;
  const providerReason = c.errors.find((message) =>
    message.startsWith(`${c.benchmark}:`),
  );
  const observationReason =
    b.observations < 20
      ? `Недостаточно общих return-интервалов портфеля и ${c.benchmark}: ${b.observations}/20.`
      : null;
  const chartReason =
    providerReason ??
    observationReason ??
    (c.analytics.performance.reason
      ? 'Непрерывный cumulative benchmark-график недоступен через trade/gap разрыв. Beta/alpha и tracking metrics могут использовать чистые aligned интервалы.'
      : 'Непрерывный общий benchmark-период не определён.');

  return (
    <>
      <section className="card">
        <div className="section-heading">
          <h2>Портфель и рынок</h2>
          <BenchmarkSelector value={c.benchmark} onChange={c.setBenchmark} />
        </div>
        <p className="caption">
          Линия портфеля и {c.benchmark} строится только для непрерывной цепочки
          общих интервалов. Регрессионные метрики используют все чистые интервалы,
          совпавшие по startDate + endDate.
        </p>
        <AnalyticsChart
          points={b.comparison.map((p) => ({
            date: p.date,
            value: p.portfolio,
            secondary: p.benchmark,
          }))}
          label="Портфель и рынок"
          secondaryLabel={c.benchmark}
          format={numeric}
          loading={c.loading}
          reason={chartReason}
        />
        <div className="analytics-metrics">
          {(['portfolioReturn', 'benchmarkReturn', 'alpha', 'beta'] as const).map(
            (metric) => (
              <AnalyticsMetric
                key={metric}
                metric={metric}
                value={b[metric]}
                sample={sample}
                ratio={metric === 'beta'}
                reason={
                  providerReason ??
                  observationReason ??
                  (['portfolioReturn', 'benchmarkReturn'].includes(metric)
                    ? chartReason
                    : null)
                }
              />
            ),
          )}
          {detailed && (
            <>
              <AnalyticsMetric metric="activeReturn" value={b.activeReturn} sample={sample} reason={chartReason} />
              <AnalyticsMetric
                metric="trackingError"
                value={b.trackingError}
                sample={sample}
                reason={providerReason ?? observationReason}
              />
              <AnalyticsMetric
                metric="informationRatio"
                value={b.informationRatio}
                sample={sample}
                ratio
                reason={providerReason ?? observationReason}
              />
              <AnalyticsMetric metric="benchmarkCorrelation" value={b.correlation} sample={sample} ratio reason={providerReason ?? observationReason} />
              <AnalyticsMetric metric="upsideCapture" value={b.upsideCapture} sample={sample} ratio reason={providerReason ?? 'Нужно минимум 20 общих положительных benchmark интервалов.'} />
              <AnalyticsMetric metric="downsideCapture" value={b.downsideCapture} sample={sample} ratio reason={providerReason ?? 'Нужно минимум 20 общих отрицательных benchmark интервалов.'} />
            </>
          )}
        </div>
        <Formula name="Нормализация" formula="Indexₜ = 100 × Π(1 + rₜ)">
          Cumulative-линии требуют непрерывный период. Beta, alpha, tracking error
          и information ratio используют строго совпавшие return-интервалы.
          История акций и ETF нормализована по adjusted close, поэтому split и
          дивидендные корректировки применяются последовательно ко всем активам.
        </Formula>
        {detailed && <section className="benchmark-rolling">
          <div className="section-heading"><div><h3>Rolling market sensitivity</h3><p className="caption">Одинаковые последовательные дневные окна, {c.period}.</p></div><div className="chart-periods" aria-label="Benchmark rolling window">{([20, 60, 252] as const).map(n => <button key={n} aria-pressed={window === n} onClick={() => setWindow(n)}>{n}D</button>)}</div></div>
          <h4>Rolling Beta · {c.benchmark}</h4><AnalyticsChart points={c.analytics.rolling.beta[window].map(point => ({ ...point, caption: `${window}D · ${point.observations} observations` }))} label={`Rolling Beta vs ${c.benchmark}`} format={numeric} loading={c.loading} reason={providerReason ?? `Недостаточно ${window} общих последовательных интервалов.`} />
          <h4>Rolling Correlation · {c.benchmark}</h4><AnalyticsChart points={c.analytics.rolling.correlation[window].map(point => ({ ...point, caption: `${window}D · ${point.observations} observations` }))} label={`Rolling correlation vs ${c.benchmark}`} format={numeric} loading={c.loading} reason={providerReason ?? `Недостаточно ${window} общих последовательных интервалов.`} />
          <Formula name="Rolling market sensitivity" formula="β=Cov(Rₚ,Rᵦ)/Var(Rᵦ); ρ=Corr(Rₚ,Rᵦ)">В каждом окне используются {window} строго общих последовательных доходностей. Для расчёта Beta variance benchmark должна быть ненулевой.</Formula>
        </section>}
      </section>
      {detailed && <PortfolioIntelligencePanel analytics={c.analytics} />}
    </>
  );
}
