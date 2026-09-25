import type { CorrelationMatrix as Matrix } from "../types/analytics";
import { Formula } from "./AnalyticsMetric";
import { numeric } from "../utils/analyticsFormat";
export function CorrelationMatrix({
  matrix,
  loading,
  reason,
}: {
  matrix: Matrix | null;
  loading: boolean;
  reason: string | null;
}) {
  return (
    <section className="card">
      <h2>Корреляция активов</h2>
      {loading ? (
        <p className="empty">Загрузка…</p>
      ) : !matrix || matrix.symbols.length < 2 ? (
        <p className="notice">
          {matrix?.symbols.length === 1 ? 'Correlation matrix requires at least two holdings.' : reason ?? "Матрица недоступна для выбранного Risk Horizon."}
        </p>
      ) : (
        <>
          <div
            className="table-scroll"
            role="region"
            tabIndex={0}
            aria-label="Матрица корреляции"
          >
            <table className="heatmap">
              <thead>
                <tr>
                  <th>Актив</th>
                  {matrix.symbols.map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.symbols.map((s, i) => (
                  <tr key={s}>
                    <th>{s}</th>
                    {matrix.correlation[i].map((v, j) => (
                      <td
                        key={j}
                        title={`${s} / ${matrix.symbols[j]} · ρ ${numeric(v)} · ${matrix.observations} observations`}
                        style={{
                          background: `color-mix(in srgb, var(--${v >= 0 ? "accent" : "negative"}) ${10 + Math.abs(v) * 40}%, transparent)`,
                        }}
                      >
                        {numeric(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="formula">
            <summary>Годовая матрица ковариации</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Актив</th>
                    {matrix.symbols.map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.symbols.map((s, i) => (
                    <tr key={s}>
                      <th>{s}</th>
                      {matrix.covariance[i].map((v, j) => (
                        <td key={j}>{v.toFixed(6)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <Formula
        name="Общая выборка"
        formula="ρᵢⱼ = Cov(Rᵢ,Rⱼ)/(σᵢσⱼ); Σ_ann = Cov_sample × 252"
      >
        {matrix && matrix.symbols.length > 1 ? (
          <>
            Текущий состав, {matrix.observations} общих интервалов. Совпадают
            начальная и конечная даты доходностей. Ковариация в квадрате десятичной
            доходности, не в процентах. Никаких будущих цен или заполнения
            пропусков.
          </>
        ) : (
          <>Общая выборка недоступна: {reason ?? "недостаточно данных для выбранного Risk Horizon"}.</>
        )}
      </Formula>
    </section>
  );
}
