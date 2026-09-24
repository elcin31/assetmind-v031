import type { Proposal } from "../../math/planningDecisions";
import { pct, numeric } from "../../utils/analyticsFormat";
import { money } from "./format";
export function RebalancePlan({
  proposal: p,
  currency,
}: {
  proposal: Proposal;
  currency: string;
}) {
  if (!p.available)
    return (
      <p className="notice" role="status">
        {p.reason}
      </p>
    );
  return (
    <>
      <div className="planning-stats">
        <div>
          <span>Portfolio drift</span>
          <b>
            {pct(p.drift)} → {pct(p.afterDrift)}
          </b>
        </div>
        <div>
          <span>Изменений</span>
          <b>{p.tradeCount}</b>
        </div>
        <div>
          <span>Estimated turnover</span>
          <b>{pct(p.turnover)}</b>
        </div>
        <div>
          <span>CASH после</span>
          <b>{money(p.cashAfter, currency)}</b>
        </div>
      </div>
      <p className="caption">
        Turnover = сумма BUY и SELL / стоимость счёта. Продажи в предложении
        выполняются до покупок.
      </p>
      {!p.rows.length ? (
        <p className="caption">
          Допустимых изменений нет. Проверьте цели, ограничения и котировки.
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Актив</th>
                <th>Сейчас</th>
                <th>Target</th>
                <th>Δ веса, п.п.</th>
                <th>Δ value</th>
                <th>Действие</th>
                <th>≈ quantity</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={r.symbol}>
                  <td>
                    <b>{r.symbol}</b>
                  </td>
                  <td>{pct(r.currentWeight)}</td>
                  <td>{pct(r.targetWeight)}</td>
                  <td>{pct(r.deltaWeight).replace("%", "")}</td>
                  <td>{money(r.delta, currency)}</td>
                  <td>
                    <span className="tag">{r.action}</span>
                  </td>
                  <td>{numeric(r.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p.notes.map((note) => (
        <p className="caption" key={note}>
          {note}
        </p>
      ))}
    </>
  );
}
