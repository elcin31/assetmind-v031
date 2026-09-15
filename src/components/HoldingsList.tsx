import type { Position } from '../types';
import { formatCurrency } from '../utils/format';

function fmt(n: number | undefined, digits = 2): string {
  if (n === undefined) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pnlClass(n: number | undefined): string {
  if (n === undefined) return '';
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return '';
}

export function HoldingsList({
  positions,
  currency,
}: {
  positions: Position[];
  currency: string;
}) {
  if (positions.length === 0) {
    return (
      <div className="card">
        <h2>Открытые позиции</h2>
        <p className="empty">Пока нет открытых позиций. Добавьте первую покупку в разделе «Сделки».</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Открытые позиции</h2>
      {positions.map((p) => (
        <div className="holding" key={p.symbol}>
          <div>
            <div className="holding-symbol">{p.symbol}</div>
            <div className="holding-meta">
              {fmt(p.quantity, 4)} × {formatCurrency(p.marketPrice, currency)} · средняя{' '}
              {formatCurrency(p.averageCost, currency)}
            </div>
          </div>
          <div className="holding-right">
            <div className="holding-value">{formatCurrency(p.marketValue, currency)}</div>
            <div className={`holding-meta ${pnlClass(p.unrealizedPnL)}`}>
              {p.unrealizedPnL !== undefined
                ? `${p.unrealizedPnL > 0 ? '+' : ''}${formatCurrency(p.unrealizedPnL, currency)}`
                : '—'}
              {p.weight !== undefined && ` · ${(p.weight * 100).toFixed(1)}%`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
