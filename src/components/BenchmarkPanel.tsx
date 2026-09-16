import type { AnalyticsController } from '../analytics/usePortfolioAnalytics';
import { BenchmarkSelector } from './BenchmarkSelector';
import { AnalyticsChart } from './AnalyticsChart';
import { AnalyticsMetric, Formula } from './AnalyticsMetric';
import { PortfolioIntelligencePanel } from './PortfolioIntelligencePanel';
import { numeric } from '../utils/analyticsFormat';

export function BenchmarkPanel({
  controller: c,
  detailed = false,
}: {
  controller: AnalyticsController;
  detailed?: boolean;
}) {
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
            </>
          )}
        </div>
        <Formula name="Нормализация" formula="Indexₜ = 100 × Π(1 + rₜ)">
          Cumulative-линии требуют непрерывный период. Beta, alpha, tracking error
          и information ratio используют строго совпавшие return-интервалы.
          История акций и ETF нормализована по adjusted close, поэтому split и
          дивидендные корректировки применяются последовательно ко всем активам.
        </Formula>
      </section>
      {detailed && <PortfolioIntelligencePanel analytics={c.analytics} />}
    </>
  );
}
