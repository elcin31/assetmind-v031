import { useMemo, useState } from "react";
import type { PortfolioSnapshot } from "../types";
import type { AnalyticsController } from "../analytics/usePortfolioAnalytics";
import {
  buildConstrainedProposal,
  DEFAULT_CONSTRAINTS,
  type PlanningConstraints,
} from "../math/planningDecisions";
import { TargetAllocation } from "../components/planning/TargetAllocation";
import { RebalancePlan } from "../components/planning/RebalancePlan";
import { NewCapitalAllocator } from "../components/planning/NewCapitalAllocator";
import { TradeWhatIf } from "../components/planning/TradeWhatIf";
import { MinimumVariance } from "../components/planning/MinimumVariance";
import { RiskHorizonSelector } from "../components/RiskHorizonSelector";
import { BenchmarkSelector } from "../components/BenchmarkSelector";
import "./PlanningPage.css";
const modes = [
  { id: "targets", label: "Цели и ребалансировка" },
  { id: "capital", label: "Новый капитал" },
  { id: "trade", label: "What-If" },
  { id: "advanced", label: "Advanced" },
] as const;
export function PlanningPage({
  snapshot: s,
  userId,
  controller: c,
  onChanged,
  onError,
}: {
  snapshot: PortfolioSnapshot;
  userId: string;
  controller: AnalyticsController;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [mode, setMode] = useState<string>("targets");
  const [constraints, setConstraints] =
    useState<PlanningConstraints>(DEFAULT_CONSTRAINTS);
  const proposal = useMemo(
    () => buildConstrainedProposal(s, constraints),
    [s, constraints],
  );
  const update = (key: keyof PlanningConstraints, value: number | boolean) =>
    setConstraints((v) => ({ ...v, [key]: value }));
  return (
    <div className="planning-page">
      <section className="planning-intro">
        <h2>Решения до сделки</h2>
        <p>Задайте цели, сравните варианты и оцените влияние на портфель.</p>
        <span className="caption">
          Все расчёты — симуляции. Сделки не отправляются автоматически.
        </span>
      </section>
      <div className="planning-tabs" role="group" aria-label="Раздел плана">
        {modes.map((m) => (
          <button
            key={m.id}
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode !== "advanced" && (
        <section className="card planning-constraints">
          <div className="section-heading">
            <h2>Ограничения расчёта</h2>
            <button
              className="text-button"
              onClick={() => setConstraints({ ...DEFAULT_CONSTRAINTS })}
            >
              Сбросить
            </button>
          </div>
          <div className="planning-fields">
            <label>
              Minimum trade value
              <input
                className="input"
                type="number"
                min="0"
                step="any"
                value={
                  Number.isNaN(constraints.minimumTradeValue)
                    ? ""
                    : constraints.minimumTradeValue
                }
                onChange={(e) =>
                  update("minimumTradeValue", e.target.valueAsNumber)
                }
              />
            </label>
            <label>
              Max position weight, %
              <input
                className="input"
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={
                  Number.isNaN(constraints.maxPositionWeight)
                    ? ""
                    : constraints.maxPositionWeight * 100
                }
                onChange={(e) =>
                  update("maxPositionWeight", e.target.valueAsNumber / 100)
                }
              />
            </label>
            <label>
              Minimum cash, %
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={
                  Number.isNaN(constraints.minimumCashWeight)
                    ? ""
                    : constraints.minimumCashWeight * 100
                }
                onChange={(e) =>
                  update("minimumCashWeight", e.target.valueAsNumber / 100)
                }
              />
            </label>
          </div>
          <div className="planning-checks">
            <label>
              <input
                type="checkbox"
                checked={constraints.buyOnly}
                onChange={(e) => update("buyOnly", e.target.checked)}
              />{" "}
              Только покупки
            </label>
            <label>
              <input
                type="checkbox"
                checked={constraints.noSell}
                onChange={(e) => update("noSell", e.target.checked)}
              />{" "}
              Не продавать
            </label>
          </div>
          <p className="caption">
            Любой из двух режимов запрещает продажи. Настройки действуют в
            текущем разделе и не меняют сохранённые цели.
          </p>
        </section>
      )}
      {mode === "targets" && (
        <>
          <TargetAllocation
            key={s.portfolio.id}
            snapshot={s}
            userId={userId}
            onChanged={onChanged}
            onError={onError}
          />
          <section className="card">
            <h2>Предложение ребалансировки</h2>
            <p className="caption">
              По сохранённым целям. Количество приблизительное; налоги, комиссии
              и лоты не учитываются.
            </p>
            <RebalancePlan
              proposal={proposal}
              currency={s.portfolio.base_currency}
            />
          </section>
        </>
      )}
      {mode === "capital" && (
        <NewCapitalAllocator snapshot={s} constraints={constraints} />
      )}
      {(mode === "trade" || mode === "advanced") && (
        <div className="planning-risk-controls">
          <RiskHorizonSelector controller={c} />
          {mode === "trade" && (
            <BenchmarkSelector value={c.benchmark} onChange={c.setBenchmark} />
          )}
        </div>
      )}
      {mode === "trade" && (
        <TradeWhatIf snapshot={s} controller={c} constraints={constraints} />
      )}
      {mode === "advanced" && <MinimumVariance analytics={c.analytics} />}
    </div>
  );
}
