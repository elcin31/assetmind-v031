import { useMemo, useState } from "react";
import type { PortfolioSnapshot } from "../../types";
import type { AnalyticsController } from "../../analytics/usePortfolioAnalytics";
import {
  simulateDecision,
  type PlanningConstraints,
  type TradeDraft,
  type DecisionState,
} from "../../math/planningDecisions";
import { pct, numeric } from "../../utils/analyticsFormat";
import { money } from "./format";
import { DecisionSummary } from "./DecisionSummary";
const rows: {
  key: keyof DecisionState;
  label: string;
  format: "money" | "pct" | "ratio";
}[] = [
  { key: "cash", label: "Cash", format: "money" },
  { key: "positionWeight", label: "Position Weight", format: "pct" },
  { key: "largestWeight", label: "Largest Position Weight", format: "pct" },
  { key: "drift", label: "Target Drift", format: "pct" },
  { key: "volatility", label: "Portfolio Volatility", format: "pct" },
  { key: "beta", label: "Portfolio Beta", format: "ratio" },
  { key: "var95", label: "Portfolio VaR 95% · 1 день", format: "pct" },
  { key: "diversification", label: "Diversification Ratio", format: "ratio" },
  {
    key: "riskContribution",
    label: "Position Risk Contribution",
    format: "pct",
  },
];
export function TradeWhatIf({
  snapshot: s,
  controller: c,
  constraints,
}: {
  snapshot: PortfolioSnapshot;
  controller: AnalyticsController;
  constraints: PlanningConstraints;
}) {
  const symbols = [
    ...new Set([
      ...s.positions.map((p) => p.symbol),
      ...(s.targetAllocation ?? []).map((p) => p.symbol),
    ]),
  ];
  const [symbol, setSymbol] = useState(symbols[0] ?? "");
  const [type, setType] = useState<"BUY" | "SELL">("BUY");
  const [mode, setMode] = useState<TradeDraft["mode"]>("quantity");
  const [amount, setAmount] = useState("1");
  const [price, setPrice] = useState(String(s.positions[0]?.marketPrice ?? ""));
  const [submitted, setSubmitted] = useState(false);
  const result = useMemo(
    () =>
      submitted
        ? simulateDecision(
            s,
            constraints,
            {
              symbol,
              type,
              mode,
              amount: Number(amount),
              price: Number(price),
            },
            c.analytics,
            c.benchmarkRiskReturns,
          )
        : null,
    [
      submitted,
      s,
      constraints,
      symbol,
      type,
      mode,
      amount,
      price,
      c.analytics,
      c.benchmarkRiskReturns,
    ],
  );
  const change = (fn: () => void) => {
    fn();
    setSubmitted(false);
  };
  return (
    <section className="card" aria-label="Pre-trade What-If">
      <h2>Pre-trade What-If</h2>
      <p className="caption">
        До / после при текущих котировках. Цена ниже — предполагаемая цена
        исполнения, а не замена рыночной оценки.
      </p>
      <div className="planning-fields">
        <label>
          Операция
          <select
            className="input"
            value={type}
            onChange={(e) =>
              change(() => setType(e.target.value as "BUY" | "SELL"))
            }
          >
            <option>BUY</option>
            <option>SELL</option>
          </select>
        </label>
        <label>
          Актив
          <select
            className="input"
            value={symbol}
            onChange={(e) =>
              change(() => {
                setSymbol(e.target.value);
                setPrice(
                  String(
                    s.positions.find((p) => p.symbol === e.target.value)
                      ?.marketPrice ?? "",
                  ),
                );
              })
            }
          >
            {!symbols.length && <option value="">Нет активов</option>}
            {symbols.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Ввод
          <select
            className="input"
            value={mode}
            onChange={(e) =>
              change(() => setMode(e.target.value as TradeDraft["mode"]))
            }
          >
            <option value="quantity">Количество</option>
            <option value="value">Сумма сделки</option>
          </select>
        </label>
        <label>
          {mode === "quantity"
            ? "Количество"
            : `Сумма, ${s.portfolio.base_currency}`}
          <input
            aria-label="Объём сценария"
            className="input"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => change(() => setAmount(e.target.value))}
          />
        </label>
        <label>
          Цена исполнения
          <input
            className="input"
            type="number"
            min="0"
            step="any"
            value={price}
            onChange={(e) => change(() => setPrice(e.target.value))}
          />
        </label>
      </div>
      <button
        className="btn btn-primary"
        disabled={!symbols.length || c.loading}
        onClick={() => setSubmitted(true)}
      >
        Рассчитать сценарий
      </button>
      {result && !result.valid && (
        <p className="notice" role="alert">
          {result.reason}
        </p>
      )}
      {result?.valid && result.before && result.after && (
        <>
          <p className="caption">
            Риск — модель фиксированных весов, {c.riskHorizon}, benchmark{" "}
            {c.benchmark}. CASH имеет нулевой модельный рыночный риск. Это не
            фактическая история счёта.
          </p>
          <div className="table-scroll">
            <table className="decision-table">
              <thead>
                <tr>
                  <th>Метрика</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    {[result.before!, result.after!].map((state, i) => {
                      const m = state[row.key];
                      return (
                        <td key={i}>
                          <b>
                            {row.format === "money"
                              ? money(m.value, s.portfolio.base_currency)
                              : row.format === "pct"
                                ? pct(m.value)
                                : numeric(m.value)}
                          </b>
                          {m.value === null && <small>{m.reason}</small>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DecisionSummary lines={result.summary} />
        </>
      )}
    </section>
  );
}
