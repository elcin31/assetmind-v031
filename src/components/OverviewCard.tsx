import type { PortfolioSnapshot } from '../types';
import { formatCurrency } from '../utils/format';

function pnlClass(n: number): string {
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return '';
}

export function OverviewCard({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const {
    portfolioValue,
    totalPnL,
    realizedPnL,
    unrealizedPnL,
    positions,
    concentration,
    valuation,
  } = snapshot;
  const currency = snapshot.portfolio.base_currency;

  return (
    <div className="card">
      <h2>Overview</h2>
      {!valuation.complete && (
        <div className="warning-banner">
          Live quotes are missing for {valuation.unpricedSymbols.join(', ')}. Value, allocation,
          and unrealized P&amp;L include priced holdings only.
        </div>
      )}
      <div className="metric-row">
        <span className="metric-label">Holdings value</span>
        <span className="metric-value">{formatCurrency(portfolioValue, currency)}</span>
      </div>
      <div className="metric-row">
        <span className="metric-label">Total P&amp;L</span>
        <span className={`metric-value ${pnlClass(totalPnL)}`}>
          {totalPnL > 0 ? '+' : ''}{formatCurrency(totalPnL, currency)}
        </span>
      </div>
      <div className="metric-row">
        <span className="metric-label">Realized</span>
        <span className={`metric-value ${pnlClass(realizedPnL)}`}>
          {realizedPnL > 0 ? '+' : ''}{formatCurrency(realizedPnL, currency)}
        </span>
      </div>
      <div className="metric-row">
        <span className="metric-label">Unrealized</span>
        <span className={`metric-value ${pnlClass(unrealizedPnL)}`}>
          {unrealizedPnL > 0 ? '+' : ''}{formatCurrency(unrealizedPnL, currency)}
        </span>
      </div>
      <div className="metric-row">
        <span className="metric-label">Positions</span>
        <span className="metric-value">{positions.length}</span>
      </div>
      {concentration.largestPositionSymbol && (
        <div className="metric-row">
          <span className="metric-label">Largest</span>
          <span className="metric-value">
            {concentration.largestPositionSymbol}{' '}
            {(concentration.largestPositionWeight * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
