import type { PortfolioAnalytics } from "../math/analytics";
import { AnalyticsChart } from "./AnalyticsChart";
import { Formula } from "./AnalyticsMetric";
import { pct } from "../utils/analyticsFormat";
export function DrawdownChart({
  analytics: a,
  loading,
}: {
  analytics: PortfolioAnalytics;
  loading: boolean;
}) {
  return (
    <section className="card">
      <div className="section-heading"><div><h2>Drawdown Lab</h2><p className="caption">Underwater series построена из фактической transaction-aware performance history.</p></div><span className="tag">{a.drawdown ? (a.drawdown.current === 0 ? 'Восстановлен' : 'Не восстановлен') : 'Недостаточно данных'}</span></div>
      <AnalyticsChart
        points={a.drawdown?.points ?? []}
        label="Просадка доходности"
        format={pct}
        underwater
        loading={loading}
        reason={a.performance.reason}
      />
      <div className="metric-row">
        <span>Самая долгая просадка</span>
        <b>{a.drawdown ? `${a.drawdown.longest} дн.` : "—"}</b>
      </div>
      <div className="metric-row">
        <span>Текущая длительность</span>
        <b>{a.drawdown ? `${a.drawdown.currentDuration} дн.` : "—"}</b>
      </div>
      <div className="metric-row">
        <span>Последнее восстановление от дна</span>
        <b>
          {a.drawdown?.recoveryTime == null
            ? "—"
            : `${a.drawdown.recoveryTime} дн.`}
        </b>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Начало</th>
              <th>Дно</th>
              <th>Восстановление</th>
              <th>Глубина</th>
              <th>Дней</th>
              <th>Восстановление, дней</th>
            </tr>
          </thead>
          <tbody>
            {a.drawdown?.worstEpisodes.map((e) => (
              <tr key={e.startDate}>
                <td>{e.startDate}</td>
                <td>{e.bottomDate}</td>
                <td>{e.recoveryDate ?? "Не восстановлено"}</td>
                <td>{pct(e.depth)}</td>
                <td>{e.duration}</td>
                <td>{e.recoveryDuration ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Formula
        name="Просадка и восстановление"
        formula="DDₜ = Wₜ/max(W₀…Wₜ) − 1"
      >
        Индекс доходности, а не пополненная стоимость. Начало — первая дата ниже
        предыдущего high; восстановление — достижение или превышение high.
        Длительности в календарных днях, восстановление — от дна. Данные:{" "}
        {a.sample}.
      </Formula>
      <details className="formula">
        <summary>Просадка стоимости активов — отдельно</summary>
        <p className="notice">
          Продажи и покупки меняют этот график. Он не измеряет инвестиционный
          убыток.
        </p>
        <AnalyticsChart
          points={a.valueDrawdown?.points ?? []}
          label="Просадка стоимости активов"
          format={pct}
          underwater
          loading={loading}
        />
        <p className="caption">
          Vₜ/max(V) − 1. Максимум: {pct(a.valueDrawdown?.max)}; текущая:{" "}
          {pct(a.valueDrawdown?.current)}.
        </p>
      </details>
    </section>
  );
}
