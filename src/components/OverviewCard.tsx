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
      <h2>Сводка</h2>
      {!valuation.complete && (
        <div className="warning-banner">
          Нет котировок: {valuation.unpricedSymbols.join(', ')}. Рыночная стоимость, распределение
          и нереализованный P&amp;L включают только оценённые позиции.
        </div>
      )}
      <div className="metric-row">
        <span className="metric-label">Стоимость активов</span>
        <span className="metric-value">{formatCurrency(portfolioValue, currency)}</span>
      </div>
      <div className="metric-row">
        <span className="metric-label">Общий P&amp;L</span>
        <span className={`metric-value ${pnlClass(totalPnL)}`}>
          {totalPnL > 0 ? '+' : ''}{formatCurrency(totalPnL, currency)}
        </span>
      </div>
      <div className="metric-row">
        <span className="metric-label">Реализованный</span>
        <span className={`metric-value ${pnlClass(realizedPnL)}`}>
          {realizedPnL > 0 ? '+' : ''}{formatCurrency(realizedPnL, currency)}
        </span>
      </div>
      <div className="metric-row">
        <span className="metric-label">Нереализованный</span>
        <span className={`metric-value ${pnlClass(unrealizedPnL)}`}>
          {unrealizedPnL > 0 ? '+' : ''}{formatCurrency(unrealizedPnL, currency)}
        </span>
      </div>
      <div className="metric-row">
        <span className="metric-label">Открытые позиции</span>
        <span className="metric-value">{positions.length}</span>
      </div>
      {concentration.largestPositionSymbol && (
        <div className="metric-row">
          <span className="metric-label">Крупнейшая позиция</span>
          <span className="metric-value">
            {concentration.largestPositionSymbol}{' '}
            {(concentration.largestPositionWeight * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
