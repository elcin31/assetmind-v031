import type { AnalyticsController } from "../analytics/usePortfolioAnalytics";
import type { Period } from "../types/analytics";
import { AnalyticsChart } from "./AnalyticsChart";
import { Formula } from "./AnalyticsMetric";
import { pct } from "../utils/analyticsFormat";
import { formatCurrency } from "../utils/format";
export function PeriodSelector({
  controller: c,
}: {
  controller: AnalyticsController;
}) {
  return (
    <div className="chart-periods" role="group" aria-label="Период аналитики">
      {(["1M", "3M", "6M", "YTD", "1Y", "ALL"] as Period[]).map((p) => (
        <button
          key={p}
          aria-pressed={c.period === p}
          onClick={() => c.setPeriod(p)}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
export function PortfolioHistoryChart({
  controller: c,
  currency,
}: {
  controller: AnalyticsController;
  currency: string;
}) {
  const a = c.analytics;
  const points = a.readouts.map((p) => ({
    date: p.date,
    value: p.value,
    caption: `Доходность периода: ${pct(p.periodReturn)}`,
  }));
  return (
    <section className="card portfolio-history">
      <div className="section-heading">
        <h2>Историческая стоимость активов</h2>
        <span className="tag">По операциям</span>
      </div>
      <PeriodSelector controller={c} />
      <AnalyticsChart
        key={c.period}
        points={points}
        label="Историческая стоимость активов"
        format={(v) => formatCurrency(v, currency)}
        loading={c.loading}
        reason={c.errors.length ? c.errors.join("; ") : a.history.reason}
      />
      <p className="caption">
        Стоимость позиций, восстановленная по истории операций. Денежный остаток
        не учтён — это не полная стоимость счёта. ALL: вся доступная история
        API, максимум 5 лет. Данные: {a.sample}.
      </p>
      {!c.loading && !c.errors.length && a.history.missingSymbols.length > 0 && (
        <p className="notice">
          Неполная история: {a.history.missingSymbols.join(", ")}. Пропущено
          дат: {a.history.missingDates.length}; стоимость неполного набора
          позиций не показана.
        </p>
      )}
      <Formula
        name="История и денежные потоки"
        formula="qᵢ(t) = Σ BUYᵢ − Σ SELLᵢ; V(t) = Σqᵢ(t)Pᵢ(t); rₜ = (Vₜ − Vₜ₋₁ − CFₜ)/Vₜ₋₁"
      >
        Операции упорядочены по timestamp, created_at, id. Оценка на конец дня
        UTC. Цены только на соответствующую дату, без подстановок из будущего.
        BUY/SELL не определяют внешний поток CF; интервалы со сделками не
        используются как фактическая доходность. Не учтены дивиденды, комиссии,
        FX и корпоративные действия.
      </Formula>
    </section>
  );
}
