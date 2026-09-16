import type { MonthlyReturn } from "../types/analytics";
import { monthlyRows } from "../math/monthly";
import { Formula } from "./AnalyticsMetric";
import { pct } from "../utils/analyticsFormat";
export function MonthlyReturnsHeatmap({
  months,
  loading,
  sample,
}: {
  months: MonthlyReturn[];
  loading: boolean;
  sample: string;
}) {
  const rows = monthlyRows(months);
  return (
    <section className="card">
      <h2>Доходность по месяцам</h2>
      {loading ? (
        <p className="empty">Загрузка…</p>
      ) : !rows.length ? (
        <p className="empty">Недостаточно истории.</p>
      ) : (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Месячная доходность"
        >
          <table className="heatmap">
            <thead>
              <tr>
                <th>Год</th>
                {[
                  "Янв",
                  "Фев",
                  "Мар",
                  "Апр",
                  "Май",
                  "Июн",
                  "Июл",
                  "Авг",
                  "Сен",
                  "Окт",
                  "Ноя",
                  "Дек",
                ].map((m) => (
                  <th key={m}>{m}</th>
                ))}
                <th>YTD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.year}>
                  <th>{row.year}</th>
                  {row.cells.map((m, i) => (
                    <td
                      key={i}
                      title={
                        m?.value == null
                          ? "Недостаточно истории или неизвестны потоки."
                          : `${m.observations} интервалов`
                      }
                      style={
                        m?.value == null
                          ? {}
                          : {
                              background: `color-mix(in srgb, var(--${m.value >= 0 ? "positive" : "negative"}) ${Math.min(55, 10 + Math.abs(m.value) * 300)}%, transparent)`,
                            }
                      }
                    >
                      {pct(m?.value)}
                    </td>
                  ))}
                  <td>{pct(row.ytd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Formula
        name="Месячная доходность и YTD"
        formula="R_month = Π(1 + r_day) − 1; R_YTD = Π(1 + R_month) − 1"
      >
        Данные: {sample}. Первый и последний месяцы могут быть неполными. YTD
        показан только при наличии базовой оценки до 1 января и всех месяцев с
        января в выбранном диапазоне. Для первого неполного января YTD
        недоступен. Неизвестный поток делает месяц недоступным.
      </Formula>
    </section>
  );
}
