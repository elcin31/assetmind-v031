import type { AnalyticsController } from '../analytics/usePortfolioAnalytics';
import type { Period } from '../types/analytics';
import { AnalyticsChart } from './AnalyticsChart';
import { Formula } from './AnalyticsMetric';
import { pct } from '../utils/analyticsFormat';
import { formatCurrency } from '../utils/format';

export function PeriodSelector({
  controller: c,
}: {
  controller: AnalyticsController;
}) {
  return (
    <div className="chart-periods" role="group" aria-label="Период аналитики">
      {(['1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as Period[]).map((p) => (
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
        <h2>Историческая стоимость счёта</h2>
        <span className="tag">Transaction-aware</span>
      </div>
      <PeriodSelector controller={c} />
      <AnalyticsChart
        key={c.period}
        points={points}
        label="Историческая стоимость счёта"
        format={(v) => formatCurrency(v, currency)}
        loading={c.loading}
        reason={c.errors.length ? c.errors.join('; ') : a.history.reason}
      />
      <p className="caption">
        Фактическая EOD-оценка счёта: reconciled cash + позиции по adjusted close.
        BUY/SELL изменяют состав и cash, но сами по себе не являются внешним
        денежным потоком. ALL: вся доступная API-история, максимум 5 лет. Данные:{' '}
        {a.sample}.
      </p>
      {a.history.missingSymbols.length > 0 && !c.errors.length && (
        <p className="notice">
          Неполная рыночная история: {a.history.missingSymbols.join(', ')}.
          Пропущено дат: {a.history.missingDates.length}; стоимость неполного
          набора позиций не показана.
        </p>
      )}
      <Formula
        name="История счёта и денежные потоки"
        formula="qᵢ(t) = Σ BUYᵢ − Σ SELLᵢ; A(t) = Cash(t) + Σqᵢ(t)Pᵢ(t)"
      >
        Операции упорядочены по timestamp, created_at, id. Оценка на конец дня
        UTC. BUY уменьшает cash на фактический execution notional, SELL увеличивает
        его; DIVIDEND/FEE отражаются в cash как доход/расход. DEPOSIT/WITHDRAWAL
        являются внешними потоками. Если такой поток попадает между двумя EOD
        оценками, exact TWR для этого интервала не рассчитывается без subperiod
        valuation в момент потока. Pᵢ(t) — adjusted close соответствующей торговой
        даты, без forward fill и без подстановки нулей. При неполном funding/cash
        ledger фактическая история счёта остаётся недоступной; Current Holdings
        Historical Risk Proxy остаётся отдельной proxy-моделью.
      </Formula>
    </section>
  );
}
