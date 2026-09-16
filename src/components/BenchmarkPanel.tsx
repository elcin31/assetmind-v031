import type { AnalyticsController } from "../analytics/usePortfolioAnalytics";
import { BenchmarkSelector } from "./BenchmarkSelector";
import { AnalyticsChart } from "./AnalyticsChart";
import { AnalyticsMetric, Formula } from "./AnalyticsMetric";
import { numeric } from "../utils/analyticsFormat";
export function BenchmarkPanel({
  controller: c,
  detailed = false,
}: {
  controller: AnalyticsController;
  detailed?: boolean;
}) {
  const b = c.analytics.benchmark;
  const sample = `${b.observations} общих интервалов · ${c.analytics.sample} · Rf ${c.rf}%`;
  return (
    <section className="card">
      <div className="section-heading">
        <h2>Портфель и рынок</h2>
        <BenchmarkSelector value={c.benchmark} onChange={c.setBenchmark} />
      </div>
      <p className="caption">
        Синяя линия — портфель; зелёная пунктирная — {c.benchmark}. Общая база
        100.
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
        reason={
          (c.errors.length ? c.errors.join("; ") : null) ?? c.analytics.performance.reason ??
          "Недостаточно непрерывной общей истории benchmark и портфеля."
        }
      />
      <div className="analytics-metrics">
        {(["portfolioReturn", "benchmarkReturn", "alpha", "beta"] as const).map(
          (metric) => (
            <AnalyticsMetric
              key={metric}
              metric={metric}
              value={b[metric]}
              sample={sample}
              ratio={metric === "beta"}
            />
          ),
        )}
        {detailed && (
          <>
            <AnalyticsMetric metric="correlation" value={b.correlation} sample={sample} ratio />
            <AnalyticsMetric metric="excessReturn" value={b.excessReturn} sample={sample} reason={c.analytics.performance.reason} />
            <AnalyticsMetric
              metric="trackingError"
              value={b.trackingError}
              sample={sample}
            />
            <AnalyticsMetric
              metric="informationRatio"
              value={b.informationRatio}
              sample={sample}
              ratio
            />
          </>
        )}
      </div>
      <Formula name="Нормализация" formula="Indexₜ = 100 × Π(1 + rₜ)">
        Обе линии на одном непрерывном периоде. Не сравниваем изменение
        стоимости с доходностью рынка. Источник цен: существующий market history
        API; ценовая доходность без реинвестирования дивидендов.
      </Formula>
    </section>
  );
}
