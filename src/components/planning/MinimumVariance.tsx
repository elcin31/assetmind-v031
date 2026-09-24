import { useMemo } from "react";
import type { PortfolioAnalytics } from "../../math/analytics";
import { planningMinimumVariance } from "../../math/planningDecisions";
import { pct } from "../../utils/analyticsFormat";
export function MinimumVariance({
  analytics,
}: {
  analytics: PortfolioAnalytics;
}) {
  const { result: r, reason } = useMemo(
    () => planningMinimumVariance(analytics),
    [analytics],
  );
  return (
    <section className="card">
      <h2>Minimum-Variance Research</h2>
      <p className="caption">
        Long-only модель активов без CASH по общей covariance matrix ·{" "}
        {analytics.riskHorizon}. Не учитывает ограничения proposal, комиссии,
        налоги и лоты.
      </p>
      {reason && <p className="notice">{reason}</p>}
      {r && (
        <>
          <div className="planning-stats">
            <div>
              <span>Current Volatility</span>
              <b>{pct(r.currentVolatility)}</b>
            </div>
            <div>
              <span>Min-Variance Volatility</span>
              <b>{pct(r.optimizedVolatility)}</b>
            </div>
            <div>
              <span>Volatility Reduction</span>
              <b>{pct(r.volatilityReduction)}</b>
            </div>
            <div>
              <span>Turnover · односторонний</span>
              <b>{pct(r.turnover)}</b>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Актив</th>
                  <th>Current weight</th>
                  <th>Optimized weight</th>
                </tr>
              </thead>
              <tbody>
                {r.weights.map((row) => (
                  <tr key={row.symbol}>
                    <td>{row.symbol}</td>
                    <td>{pct(row.currentWeight)}</td>
                    <td>{pct(row.optimizedWeight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
