import { useState } from "react";
import type { PortfolioSnapshot } from "../types";
import type { AnalyticsController } from "../analytics/usePortfolioAnalytics";
import { AnalyticsMetric, Formula } from "./AnalyticsMetric";
import { pct } from "../utils/analyticsFormat";
import { PortfolioHistoryChart, PeriodSelector } from "./PortfolioHistoryChart";
import { MonthlyReturnsHeatmap } from "./MonthlyReturnsHeatmap";
import { DrawdownChart } from "./DrawdownChart";
import { CorrelationMatrix } from "./CorrelationMatrix";
import { BenchmarkPanel } from "./BenchmarkPanel";
import { AttributionPanel } from "./AttributionPanel";
import { ScenariosPanel } from "./ScenariosPanel";
import { AnalyticsChart } from "./AnalyticsChart";
import { rollingMetric } from "../math/rolling";
const tabs = [
  { id: "performance", label: "Доходность" },
  { id: "risk", label: "Риск" },
  { id: "diversification", label: "Диверсификация" },
  { id: "attribution", label: "Атрибуция" },
  { id: "scenarios", label: "Сценарии" },
  { id: "benchmark", label: "Рынок" },
];
export function Laboratory({
  snapshot,
  controller: c,
}: {
  snapshot: PortfolioSnapshot;
  controller: AnalyticsController;
}) {
  const [tab, setTab] = useState("performance");
  const [volWindow, setVolWindow] = useState(20);
  const [sharpeWindow, setSharpeWindow] = useState(63);
  const a = c.analytics;
  const providerReason = c.errors.length ? c.errors.join("; ") : null;
  const riskReason = c.loading ? "Загрузка истории…" : providerReason ?? (a.performance.riskReturns.length < 20
    ? `Недостаточно наблюдений: ${a.performance.riskReturns.length}; нужно минимум 20 чистых интервалов.`
    : "Метрика математически не определена: проверьте дисперсию и число наблюдений ниже MAR (минимум 2).");
  const sample = `${a.sample} · Rf ${c.rf}% · MAR ${c.mar}%`;
  const vol =
    tab === "risk"
      ? rollingMetric(a.performance.riskReturns, volWindow, "volatility")
      : [];
  const rollingSharpe =
    tab === "risk"
      ? rollingMetric(a.performance.riskReturns, sharpeWindow, "sharpe", c.rf / 100)
      : [];
  return (
    <>
      <section className="lab-intro">
        <div>
          <span className="eyebrow">АНАЛИТИКА ПОРТФЕЛЯ</span>
          <h2>Лаборатория</h2>
          <p>Результат, источники риска и сценарии.</p>
        </div>
      </section>
      <div className="lab-tabs" role="group" aria-label="Раздел аналитики">
        {tabs.map((t) => (
          <button
            key={t.id}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="analytics-settings">
        <label>
          Безрисковая ставка, % в год
          <input
            className="input"
            type="number"
            min="-10"
            max="100"
            step=".25"
            value={c.rf}
            onChange={(e) =>
              c.setRf(Math.max(-10, Math.min(100, Number(e.target.value))))
            }
          />
        </label>
        <label>
          MAR, % в год
          <input
            className="input"
            type="number"
            min="-10"
            max="100"
            step=".25"
            value={c.mar}
            onChange={(e) =>
              c.setMar(Math.max(-10, Math.min(100, Number(e.target.value))))
            }
          />
        </label>
      </div>
      {tab !== "performance" && c.loading && <p role="status">Загрузка истории…</p>}
      {tab !== "performance" && <PeriodSelector controller={c} />}
      {(tab === "performance" || tab === "risk" || tab === "benchmark") &&
        a.performance.reason &&
        !c.loading && !c.errors.length && <p className="caption">{a.performance.reason}</p>}
      {tab === "performance" && (
        <>
          <PortfolioHistoryChart
            controller={c}
            currency={snapshot.portfolio.base_currency}
          />
          <section className="card">
            <div className="analytics-metrics">
              {(
                [
                  "twr",
                  "cagr",
                  "totalReturn",
                  "bestDay",
                  "worstDay",
                  "positiveDays",
                  "negativeDays",
                ] as const
              ).map((metric) => (
                <AnalyticsMetric
                  key={metric}
                  metric={metric}
                  value={a.performance[metric]}
                  sample={sample}
                  reason={providerReason ?? a.performance.reason}
                />
              ))}
            </div>
          </section>
          <MonthlyReturnsHeatmap
            months={a.performance.monthly}
            loading={c.loading}
            sample={sample}
          />
        </>
      )}
      {tab === "risk" && (
        <>
          <section className="card">
            <h2>Риск исторического портфеля</h2>
            <p className="caption">Чистые наблюдаемые интервалы: {a.performance.riskReturns.length}. Интервалы со сделками и пропусками исключены; доходности через них не соединяются.</p>
            <div className="analytics-metrics">
              {(
                [
                  "volatility",
                  "downside",
                  "sharpe",
                  "sortino",
                  "calmar",
                  "var95",
                  "es95",
                ] as const
              ).map((metric) => (
                <AnalyticsMetric
                  key={metric}
                  metric={metric}
                  value={a.risk[metric]}
                  sample={sample}
                  ratio={["sharpe", "sortino", "calmar"].includes(metric)}
                  reason={metric === "calmar" ? providerReason ?? a.performance.reason ?? "Calmar требует CAGR и ненулевую просадку." : riskReason}
                />
              ))}
              <AnalyticsMetric
                metric="maxDrawdown"
                value={a.drawdown?.max}
                sample={sample}
              />
              <AnalyticsMetric
                metric="currentDrawdown"
                value={a.drawdown?.current}
                sample={sample}
              />
            </div>
          </section>
          <DrawdownChart analytics={a} loading={c.loading} />
          <section className="card">
            <h2>Скользящая волатильность</h2>
            <div className="chart-periods" aria-label="Окно волатильности">
              {[20, 60, 252].map((n) => (
                <button
                  key={n}
                  aria-pressed={volWindow === n}
                  onClick={() => setVolWindow(n)}
                >
                  {n}D
                </button>
              ))}
            </div>
            <AnalyticsChart
              key={`vol-${volWindow}-${c.period}`}
              points={vol}
              label="Скользящая волатильность"
              format={pct}
              loading={c.loading}
              reason={providerReason ?? a.performance.reason}
            />
            <Formula
              name="Окно волатильности"
              formula="σ_window = stdev_sample(r_window) × √252"
            >
              Нужно полное окно из {volWindow} доходностей. Участок до его
              накопления не рисуется. Данные: {sample}.
            </Formula>
          </section>
          <section className="card">
            <h2>Скользящий Sharpe</h2>
            <div className="chart-periods" aria-label="Окно Sharpe">
              {[63, 126, 252].map((n) => (
                <button
                  key={n}
                  aria-pressed={sharpeWindow === n}
                  onClick={() => setSharpeWindow(n)}
                >
                  {n}D
                </button>
              ))}
            </div>
            <AnalyticsChart
              key={`sharpe-${sharpeWindow}-${c.period}`}
              points={rollingSharpe}
              label="Скользящий Sharpe"
              format={(v) => v.toFixed(2)}
              loading={c.loading}
              reason={providerReason ?? a.performance.reason}
            />
            <Formula
              name="Окно Sharpe"
              formula="252(mean(r_window) − ((1+Rf)^(1/252)−1)) / σ_window"
            >
              Полное окно {sharpeWindow} доходностей, Rf {c.rf}% в год. При
              нулевой волатильности участок недоступен. Данные: {sample}.
            </Formula>
          </section>
          <section className="card">
            <h2>Исторический риск текущего состава · proxy</h2>
            <p className="caption">
              Как сегодняшний состав портфеля вёл бы себя на прошлых
              исторических ценах. Это модель, не фактическая доходность.
            </p>
            <div className="analytics-metrics">
              <AnalyticsMetric
                metric="volatility"
                value={a.proxy.volatility}
                sample={`${a.proxy.dailyReturns.length} доходностей proxy`}
              />
              <AnalyticsMetric
                metric="sharpe"
                value={a.proxy.sharpe}
                sample={`proxy · Rf ${c.rf}%`}
                ratio
              />
              <AnalyticsMetric metric="maxDrawdown" value={a.proxy.drawdown?.max} sample="Current Holdings Historical Risk Proxy · не фактическая просадка" />
            </div>
            <Formula
              name="Текущие количества"
              formula="V_proxy(t) = Σqᵢ(today)Pᵢ(t)"
            >
              Фиксированные сегодняшние количества, общие даты цен. Модель не
              учитывает реальные исторические сделки. Для коэффициентов минимум
              20 доходностей.
            </Formula>
          </section>
        </>
      )}
      {tab === "diversification" && (
        <>
          <section className="card">
            <div className="analytics-metrics">
              <AnalyticsMetric
                metric="covarianceVol"
                value={a.currentRisk?.volatility}
                sample={`${a.matrix?.observations ?? 0} общих интервалов`}
              />
              <AnalyticsMetric
                metric="diversificationRatio"
                value={a.currentRisk?.diversificationRatio}
                sample={sample}
                ratio
              />
              <AnalyticsMetric
                metric="averageCorrelation"
                value={a.averageCorrelation}
                sample={sample}
                ratio
              />
              <AnalyticsMetric
                metric="hhi"
                value={a.concentration?.hhi}
                sample="текущие рыночные веса"
                ratio
              />
              <AnalyticsMetric
                metric="effectivePositions"
                value={a.concentration?.effectivePositions}
                sample="текущие рыночные веса"
                ratio
              />
            </div>
          </section>
          <CorrelationMatrix
            matrix={a.matrix}
            loading={c.loading}
            reason={
              providerReason ?? (a.history.missingSymbols.length
                ? `Нет полной истории: ${a.history.missingSymbols.join(", ")}.`
                : "Недостаточно общей истории или нулевая дисперсия.")
            }
          />
          <section className="card">
            <h2>Вклад в риск текущего состава</h2>
            {!a.currentRisk && !c.loading && !c.errors.length && (
              <p className="notice">
                Нужны котировки всех позиций, общая история и ненулевая
                волатильность портфеля.
              </p>
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Актив</th>
                    <th>Вес</th>
                    <th>Вклад в риск</th>
                    <th>MCR</th>
                    <th>RC · дисперсия</th>
                  </tr>
                </thead>
                <tbody>
                  {a.currentRisk?.contributions.map((c) => (
                    <tr key={c.symbol}>
                      <td>{c.symbol}</td>
                      <td>{pct(c.weight)}</td>
                      <td>{pct(c.fraction)}</td>
                      <td>{c.marginal.toFixed(4)}</td>
                      <td>{c.absolute.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Formula
              name="Разложение риска"
              formula="MCRᵢ = (Σw)ᵢ; RCᵢ = wᵢMCRᵢ; shareᵢ = RCᵢ/(wᵀΣw)"
            >
              Годовая ковариация и текущие рыночные веса. Сумма RC равна
              дисперсии портфеля. Отрицательный вклад возможен у
              хеджирующего актива. Данные: {a.matrix?.observations ?? 0} общих
              интервалов.
            </Formula>
          </section>
        </>
      )}
      {tab === "attribution" && (
        <AttributionPanel
          analytics={a}
          currency={snapshot.portfolio.base_currency}
        />
      )}
      {tab === "scenarios" && <ScenariosPanel snapshot={snapshot} />}
      {tab === "benchmark" && <BenchmarkPanel controller={c} detailed />}
    </>
  );
}
