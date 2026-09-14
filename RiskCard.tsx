import type { PortfolioSnapshot } from '../types';
import { formatCurrency } from '../utils/format';

function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(digits);
}

export function RiskCard({
  risk,
  snapshot,
}: {
  risk?: PortfolioSnapshot['risk'];
  snapshot: PortfolioSnapshot;
}) {
  const currency = snapshot.portfolio.base_currency;

  return (
    <>
      <div className="card">
        <h2>Risk</h2>
        {!snapshot.valuation.complete && (
          <div className="warning-banner" role="status">
            Risk and valuation context may be incomplete because live quotes are missing for{' '}
            {snapshot.valuation.unpricedSymbols.join(', ')}.
          </div>
        )}
        {!risk?.available && (
          <p className="empty compact-empty">
            {risk?.reason === 'empty_portfolio'
              ? 'No positions to compute risk.'
              : risk?.reason === 'insufficient_history' ||
                  risk?.reason?.startsWith('insufficient')
                ? 'Insufficient historical data for risk metrics.'
                : 'Risk metrics unavailable.'}
          </p>
        )}
        <div className="metric-row">
          <span className="metric-label">Volatility (ann.)</span>
          <span className="metric-value">{fmtPct(risk?.volatility)}</span>
        </div>
        <div className="metric-row">
          <span className="metric-label">Sharpe (rf=0)</span>
          <span className="metric-value">{fmtNum(risk?.sharpe)}</span>
        </div>
        <div className="metric-row">
          <span className="metric-label">Holdings value</span>
          <span className="metric-value">
            {formatCurrency(snapshot.portfolioValue, currency)}
          </span>
        </div>
        <div className="metric-row">
          <span className="metric-label">Total P&amp;L</span>
          <span className="metric-value">{formatCurrency(snapshot.totalPnL, currency)}</span>
        </div>
        {snapshot.concentration.largestPositionSymbol && (
          <div className="metric-row">
            <span className="metric-label">Concentration</span>
            <span className="metric-value">
              {snapshot.concentration.largestPositionSymbol}{' '}
              {(snapshot.concentration.largestPositionWeight * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {snapshot.concentration.topHoldings.length > 0 && (
        <div className="card">
          <h2>Top holdings</h2>
          {snapshot.concentration.topHoldings.map((h) => (
            <div className="metric-row" key={h.symbol}>
              <span className="metric-label">{h.symbol}</span>
              <span className="metric-value">{(h.weight * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
