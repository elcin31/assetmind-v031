import { useState } from "react";
import type { PortfolioAnalytics } from "../math/analytics";
import { formatCurrency } from "../utils/format";
import { Formula } from "./AnalyticsMetric";
import { pct } from "../utils/analyticsFormat";
export function AttributionPanel({
  analytics: a,
  currency,
  compact = false,
}: {
  analytics: PortfolioAnalytics;
  currency: string;
  compact?: boolean;
}) {
  const [detractors, setDetractors] = useState(false);
  const rows = (detractors ? [...a.pnl].reverse() : a.pnl).slice(
    0,
    compact ? 5 : undefined,
  );
  return (
    <section className="card">
      <div className="section-heading">
        <h2>Вклад активов в P&amp;L</h2>
        <button
          className="text-button"
          onClick={() => setDetractors((v) => !v)}
        >
          {detractors ? "Лидеры роста ↑" : "Лидеры снижения ↓"}
        </button>
      </div>
      <p className="caption">
        За всё время операций, в валюте портфеля. Закрытые позиции включены.
      </p>
      {!rows.length && <p className="empty">Нет операций для атрибуции.</p>}
      {rows.map((p) => (
        <div className="attribution-row" key={p.symbol}>
          <div className="metric-row">
            <b>{p.symbol}</b>
            <span className={(p.totalPnL ?? 0) < 0 ? "negative" : "positive"}>
              {p.totalPnL === null ? "—" : formatCurrency(p.totalPnL, currency)}
            </span>
          </div>
          <div className="contribution-track">
            <i
              style={{
                width: `${p.barWidth}%`,
                background:
                  (p.totalPnL ?? 0) < 0 ? "var(--negative)" : "var(--positive)",
              }}
            />
          </div>
          {!compact && (
            <p className="caption">
              Реализованный:{" "}
              {formatCurrency(p.realizedPnL ?? undefined, currency)} ·
              Нереализованный:{" "}
              {formatCurrency(p.unrealizedPnL ?? undefined, currency)}
            </p>
          )}
        </div>
      ))}
      <Formula
        name="Денежный вклад"
        formula="PnLᵢ = realizedPnLᵢ + unrealizedPnLᵢ"
      >
        Существующая Weighted Average Cost модель. Это денежный P&amp;L за всё
        время, а не процентная доходность выбранного периода. Без котировки
        открытой позиции общий P&amp;L недоступен.
      </Formula>
      {!compact && (
        <>
          <h2 className="subsection-title">Вклад в доходность за период</h2>
          {!a.contributions.length ? (
            <p className="notice">
              {a.performance.reason ??
                "Недостаточно данных для весов начала периода."}
            </p>
          ) : (
            a.contributions.map((c) => (
              <div className="metric-row" key={c.symbol}>
                <span>{c.symbol}</span>
                <b>{pct(c.value)}</b>
              </div>
            ))
          )}
          <Formula
            name="Связанный вклад"
            formula="cᵢ,ₜ = wᵢ,ₜ₋₁rᵢ,ₜ; Cᵢ = Σₜ Wₜ₋₁cᵢ,ₜ"
          >
            Веса восстановлены на начало каждого интервала. W — накопленный
            индекс богатства с базой 1. Сумма C равна накопленной доходности.
            Доступно только для непрерывного периода без неизвестных потоков.
            Данные: {a.sample}.
          </Formula>
        </>
      )}
    </section>
  );
}
