import { useState } from "react";
import type { Position } from "../types";
import type { PortfolioAnalytics } from "../math/analytics";
import { formatCurrency } from "../utils/format";
import { PriceChart } from "./PriceChart";
import { Formula } from "./AnalyticsMetric";
import { pct } from "../utils/analyticsFormat";
export function HoldingsList({
  positions,
  currency,
  analytics,
  benchmark = "SPY",
}: {
  positions: Position[];
  currency: string;
  analytics?: PortfolioAnalytics;
  benchmark?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <section className="card">
      <h2>Открытые позиции</h2>
      {!positions.length && (
        <p className="empty">
          Пока нет открытых позиций. Добавьте первую покупку в разделе «Сделки».
        </p>
      )}
      {positions.map((p) => {
        const d = analytics?.details[p.symbol];
        const open = expanded === p.symbol;
        const money = (v: number | undefined) => formatCurrency(v, currency);
        return (
          <div className="holding-container" key={p.symbol}>
            <button
              className="holding holding-toggle"
              aria-expanded={open}
              onClick={() => setExpanded(open ? null : p.symbol)}
            >
              <div>
                <div className="holding-symbol">
                  {p.symbol} <span aria-hidden="true">{open ? "−" : "+"}</span>
                </div>
                <div className="holding-meta">
                  {p.quantity.toLocaleString("ru-RU", {
                    maximumFractionDigits: 8,
                  })}{" "}
                  × {money(p.marketPrice)} · средняя {money(p.averageCost)}
                </div>
              </div>
              <div className="holding-right">
                <div className="holding-value">{money(p.marketValue)}</div>
                <div
                  className={`holding-meta ${(p.unrealizedPnL ?? 0) < 0 ? "negative" : "positive"}`}
                >
                  {money(p.unrealizedPnL)} · {pct(d?.positionReturn)}
                </div>
              </div>
            </button>
            {open && (
              <div className="holding-detail">
                <dl className="holding-details-grid">
                  {[
                    [
                      "Количество",
                      p.quantity.toLocaleString("ru-RU", {
                        maximumFractionDigits: 8,
                      }),
                    ],
                    ["Средняя цена", money(p.averageCost)],
                    ["Текущая цена", money(p.marketPrice)],
                    ["Рыночная стоимость", money(p.marketValue)],
                    ["Нереализованный P&L", money(p.unrealizedPnL)],
                    ["Реализованный P&L", money(p.realizedPnL)],
                    ["Общий P&L", money(p.totalPnL)],
                    ["Доходность позиции", pct(d?.positionReturn)],
                    ["Вес портфеля", pct(d?.weight)],
                    ["Вклад в риск", pct(d?.riskContribution)],
                    ["Волатильность · год", pct(d?.volatility)],
                    [
                      "Корреляция с текущим составом",
                      d?.correlation == null ? "—" : d.correlation.toFixed(2),
                    ],
                    [
                      `Beta к ${benchmark}`,
                      d?.beta == null ? "—" : d.beta.toFixed(2),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="caption">
                  — означает недостаток данных или неопределённую метрику. Риск,
                  корреляция и Beta требуют ≥20 общих доходностей выбранного
                  периода; вклад в риск — котировок всех позиций. Корреляция с
                  портфелем использует явно модель текущих количеств, а не
                  фактическую историю.
                </p>
                <Formula
                  name="Метрики позиции"
                  formula="Return = price/averageCost − 1; weight = marketValue/ΣmarketValue; β = Cov(asset, benchmark)/Var(benchmark)"
                >
                  Доходность позиции относится к оставшейся средней
                  себестоимости, без реализованной прибыли и дивидендов.
                  Волатильность: stdev_sample(r)√252; корреляция: Cov/(σᵢσp);
                  риск: wᵢ(Σw)ᵢ/σp². P&amp;L рассчитан существующим WAC engine.
                  Данные: {analytics?.sample ?? "нет истории"}.
                </Formula>
                <PriceChart symbol={p.symbol} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
