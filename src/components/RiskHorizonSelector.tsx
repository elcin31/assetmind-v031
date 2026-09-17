import type { AnalyticsController } from '../analytics/usePortfolioAnalytics';
import type { RiskHorizon } from '../types/analytics';

export function RiskHorizonSelector({
  controller: c,
}: {
  controller: AnalyticsController;
}) {
  return (
    <div className="chart-periods" role="group" aria-label="Risk Horizon">
      {(['20D', '60D', '1Y'] as RiskHorizon[]).map((horizon) => (
        <button
          key={horizon}
          aria-pressed={c.riskHorizon === horizon}
          onClick={() => c.setRiskHorizon(horizon)}
        >
          {horizon}
        </button>
      ))}
    </div>
  );
}
