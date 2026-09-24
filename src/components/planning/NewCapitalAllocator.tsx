import { useState } from "react";
import type { PortfolioSnapshot } from "../../types";
import {
  buildConstrainedProposal,
  type PlanningConstraints,
} from "../../math/planningDecisions";
import { RebalancePlan } from "./RebalancePlan";
import { money } from "./format";
export function NewCapitalAllocator({
  snapshot,
  constraints,
}: {
  snapshot: PortfolioSnapshot;
  constraints: PlanningConstraints;
}) {
  const [amount, setAmount] = useState("1000");
  const p = buildConstrainedProposal(snapshot, constraints, Number(amount));
  return (
    <section className="card">
      <h2>Распределить новый капитал</h2>
      <p className="caption">
        Только покупки из введённой суммы. Существующий CASH не расходуется;
        нераспределённый капитал остаётся в резерве.
      </p>
      <label className="planning-amount">
        Новый капитал, {snapshot.portfolio.base_currency}
        <input
          className="input"
          aria-label="Новый капитал"
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <RebalancePlan proposal={p} currency={snapshot.portfolio.base_currency} />
      {p.available && (
        <p className="caption">
          Остаток нового капитала:{" "}
          <b>{money(p.unallocated, snapshot.portfolio.base_currency)}</b>. Это
          симуляция пополнения, денежная операция не создаётся.
        </p>
      )}
    </section>
  );
}
