import { useState } from "react";
import type { PortfolioSnapshot } from "../types";
import type { AnalyticsController } from "../analytics/usePortfolioAnalytics";
import {
  isFiniteValue,
  overviewInsights,
  overviewReadouts,
  topPnlRows,
} from "../analytics/overview";
import { AnalyticsChart } from "../components/AnalyticsChart";
import { BenchmarkSelector } from "../components/BenchmarkSelector";
import { PeriodSelector } from "../components/PortfolioHistoryChart";
import { RiskHorizonSelector } from "../components/RiskHorizonSelector";
import { AllocationCard } from "../components/AllocationCard";
import { formatCurrency } from "../utils/format";
import { numeric, pct } from "../utils/analyticsFormat";
import "./OverviewPage.css";

interface Props {
  snapshot: PortfolioSnapshot;
  controller: AnalyticsController;
  onHoldings: () => void;
  onTrade: () => void;
  onAnalytics: () => void;
}

function Metric({
  label,
  value,
  note,
  reason,
}: {
  label: string;
  value: string;
  note: string;
  reason?: string | null;
}) {
  return (
    <div className="overview-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
      {value === "—" && reason && (
        <details>
          <summary>Почему недоступно?</summary>
          <p>{reason}</p>
        </details>
      )}
    </div>
  );
}

export function OverviewPage({
  snapshot: s,
  controller: c,
  onHoldings,
  onTrade,
  onAnalytics,
}: Props) {
  const a = c.analytics;
  const [detractors, setDetractors] = useState(false);
  const readouts = overviewReadouts(s, a);
  const signals = overviewInsights(s, a, c.loading, c.errors);
  const rows = topPnlRows(a, detractors);
  const money = (value: number | null | undefined) =>
    isFiniteValue(value)
      ? formatCurrency(value, s.portfolio.base_currency)
      : "—";
  const signedMoney = (value: number | null | undefined) =>
    `${isFiniteValue(value) && value > 0 ? "+" : ""}${money(value)}`;
  const tone = (value: number | null | undefined) =>
    !isFiniteValue(value) || value === 0
      ? ""
      : value > 0
        ? "positive"
        : "negative";
  const empty =
    !s.positions.length && !s.transactions.length && !s.cashEvents?.length;
  const benchmarkReason = c.errors.find((e) => e.startsWith(`${c.benchmark}:`))
    ? `История ${c.benchmark} временно недоступна. Повторите загрузку.`
    : (a.history.reason ??
      (a.performance.reason
        ? "Для сравнения нужна непрерывная история портфеля без неизвестных денежных потоков и пропущенных оценок."
        : `У портфеля и ${c.benchmark} нет полной общей истории за выбранный период.`));
  const historyReason =
    a.history.reason ??
    a.performance.reason ??
    "Недостаточно наблюдений для выбранного периода.";
  const allocation = [...s.allocation].sort((x, y) => y.weight - x.weight);
  const compactAllocation =
    allocation.length <= 4
      ? allocation
      : [
          ...allocation.slice(0, 3),
          {
            symbol: "Остальные",
            weight: allocation.slice(3).reduce((sum, p) => sum + p.weight, 0),
            marketValue: allocation
              .slice(3)
              .reduce((sum, p) => sum + p.marketValue, 0),
          },
        ];

  return (
    <div className="overview-page" aria-label="Обзор портфеля">
      <section className="overview-hero" aria-label="Стоимость портфеля">
        <div className="overview-hero-top">
          <span className="eyebrow">
            {s.valuation.complete && isFiniteValue(s.accountValue)
              ? "СТОИМОСТЬ СЧЁТА"
              : "СТОИМОСТЬ АКТИВОВ"}
          </span>
          <button className="text-button" onClick={onTrade}>
            ＋ Операция
          </button>
        </div>
        <div className="overview-value" data-testid="portfolio-value">
          {money(readouts.value)}
        </div>
        {!s.valuation.complete && (
          <p className="caption">
            Рыночная оценка неполная. Ожидаем котировки всех позиций.
          </p>
        )}
        <div className="overview-period-result">
          <div>
            <span>Изменение стоимости · {c.period}</span>
            <b className={tone(readouts.valueChange)}>
              {c.loading ? "—" : signedMoney(readouts.valueChange)}
            </b>
          </div>
          <div>
            <span>Доходность · {c.period}</span>
            <b className={tone(a.performance.totalReturn)}>
              {c.loading ? "—" : pct(a.performance.totalReturn)}
            </b>
          </div>
        </div>
        <p className="caption">
          Изменение стоимости включает пополнения и снятия.
        </p>
        <PeriodSelector controller={c} />
        <div className="overview-hero-bottom">
          <div>
            <span>Total P&amp;L · всё время</span>
            <b className={s.valuation.complete ? tone(s.totalPnL) : ""}>
              {signedMoney(s.valuation.complete ? s.totalPnL : null)}
            </b>
          </div>
          <div>
            <span>
              Сверх {c.benchmark} · {c.period}
            </span>
            <b className={tone(readouts.excessReturn)}>
              {!c.loading && isFiniteValue(readouts.excessReturn)
                ? `${readouts.excessReturn > 0 ? "+" : ""}${numeric(readouts.excessReturn * 100)} п.п.`
                : "—"}
            </b>
          </div>
        </div>
      </section>

      {empty && (
        <section className="card overview-empty">
          <h2>Ваш портфель начинается здесь</h2>
          <p>
            Добавьте пополнение и первую покупку, чтобы увидеть стоимость и
            результат.
          </p>
          <button className="btn btn-primary" onClick={onTrade}>
            Добавить операцию
          </button>
        </section>
      )}

      <section
        className="card overview-performance"
        aria-label="Сравнение с benchmark"
      >
        <div className="section-heading">
          <h2>Портфель и рынок</h2>
          <BenchmarkSelector value={c.benchmark} onChange={c.setBenchmark} />
        </div>
        <p className="overview-chart-legend">
          <span>Портфель</span>
          <span>{c.benchmark}</span>
          <small>Индекс · старт = 100</small>
        </p>
        <AnalyticsChart
          key={`${c.period}-${c.benchmark}`}
          points={readouts.comparison.map((p) => ({
            date: p.date,
            value: p.portfolio,
            secondary: p.benchmark,
          }))}
          label="Портфель и рынок"
          secondaryLabel={c.benchmark}
          format={numeric}
          loading={c.loading}
          reason={
            empty
              ? "После первых операций здесь появится сравнение с рынком."
              : benchmarkReason
          }
        />
        {!c.loading && !readouts.comparison.length && !empty && (
          <button className="text-button" onClick={c.retry}>
            Повторить загрузку
          </button>
        )}
      </section>

      <section
        className="card overview-key-metrics"
        aria-label="Ключевые показатели"
      >
        <div className="section-heading">
          <h2>Ключевые показатели</h2>
          <RiskHorizonSelector controller={c} />
        </div>
        <div className="overview-metrics">
          <Metric
            label="CAGR"
            value={c.loading ? "—" : pct(a.performance.cagr)}
            note={`За период ${c.period}`}
            reason={
              a.performance.reason ?? "CAGR требует минимум 30 дней истории."
            }
          />
          <Metric
            label="Sharpe"
            value={c.loading ? "—" : numeric(a.risk.sharpe)}
            note={`Риск · ${c.riskHorizon}`}
            reason={
              a.riskReason ??
              "Недостаточно наблюдений или нулевая волатильность."
            }
          />
          <Metric
            label="Max Drawdown"
            value={c.loading ? "—" : pct(a.drawdown?.max)}
            note={`За период ${c.period}`}
            reason={historyReason}
          />
          <Metric
            label="Volatility"
            value={c.loading ? "—" : pct(a.risk.volatility)}
            note={`Годовая · ${c.riskHorizon}`}
            reason={a.riskReason ?? historyReason}
          />
        </div>
      </section>

      <section
        className="card overview-attention"
        aria-label="Требует внимания"
      >
        <div className="section-heading">
          <h2>Требует внимания</h2>
          <button className="text-button" onClick={onAnalytics}>
            Аналитика ↗
          </button>
        </div>
        {signals.length ? (
          <ul className="overview-insights">
            {signals.map((signal) => (
              <li key={signal.id} data-severity={signal.severity}>
                <span className="overview-severity">{signal.severity}</span>
                <div>
                  <h3>{signal.title}</h3>
                  <p>{signal.explanation}</p>
                </div>
                <b>{signal.metric}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="caption">
            {c.loading
              ? "Проверяем доступные данные…"
              : empty
                ? "Сигналы появятся, когда в портфеле будут данные."
                : "Подтверждённых сигналов по доступным данным нет."}
          </p>
        )}
      </section>

      <div className="overview-secondary">
        <section
          className="card overview-contributors"
          aria-label="Вклад активов"
        >
          <h2>Вклад в результат</h2>
          <p className="caption">Top 3 · P&amp;L за всё время</p>
          <div className="chart-periods" role="group" aria-label="Тип вклада">
            <button
              aria-pressed={!detractors}
              onClick={() => setDetractors(false)}
            >
              Contributors
            </button>
            <button
              aria-pressed={detractors}
              onClick={() => setDetractors(true)}
            >
              Detractors
            </button>
          </div>
          {rows.length ? (
            rows.map((p) => (
              <div className="overview-contributor" key={p.symbol}>
                <b>{p.symbol}</b>
                <span className={tone(p.totalPnL)}>
                  {signedMoney(p.totalPnL)}
                </span>
              </div>
            ))
          ) : (
            <p className="caption">
              Нет подтверждённых{" "}
              {detractors ? "отрицательных" : "положительных"} вкладов.
            </p>
          )}
          {!s.valuation.complete && (
            <p className="caption">Позиции без полной оценки не включены.</p>
          )}
        </section>
        {s.valuation.complete ? (
          <AllocationCard allocation={compactAllocation} />
        ) : (
          <section className="card">
            <h2>Распределение</h2>
            <p className="caption">
              Для весов нужны котировки всех открытых позиций.
            </p>
          </section>
        )}
      </div>

      <section className="card overview-holdings" aria-label="Открытые позиции">
        <div className="section-heading">
          <h2>Открытые позиции</h2>
          <button className="text-button" onClick={onHoldings}>
            Все активы →
          </button>
        </div>
        {!s.positions.length ? (
          <p className="caption">Открытых позиций пока нет.</p>
        ) : (
          <ul>
            {s.positions.slice(0, 5).map((p) => (
              <li key={p.symbol} className="overview-holding">
                <div className="overview-holding-symbol">
                  <b>{p.symbol}</b>
                </div>
                <dl>
                  <div>
                    <dt>Стоимость</dt>
                    <dd>{money(p.marketValue)}</dd>
                  </div>
                  <div>
                    <dt>Вес активов</dt>
                    <dd>
                      {pct(
                        s.valuation.complete
                          ? a.details[p.symbol]?.weight
                          : null,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>P&amp;L · всё время</dt>
                    <dd className={tone(p.totalPnL)}>
                      {signedMoney(p.totalPnL)}
                    </dd>
                  </div>
                  <div>
                    <dt>Return</dt>
                    <dd className={tone(a.details[p.symbol]?.positionReturn)}>
                      {pct(a.details[p.symbol]?.positionReturn)}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
