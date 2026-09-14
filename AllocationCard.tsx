import type { PortfolioSnapshot } from '../types';

const COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

export function AllocationCard({
  allocation,
}: {
  allocation: PortfolioSnapshot['allocation'];
}) {
  if (allocation.length === 0) {
    return (
      <div className="card">
        <h2>Allocation</h2>
        <p className="empty">No positions yet</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Allocation</h2>
      <div className="alloc-bar">
        {allocation.map((a, i) => (
          <div
            key={a.symbol}
            className="alloc-seg"
            style={{
              width: `${Math.max(a.weight * 100, 0.5)}%`,
              background: COLORS[i % COLORS.length],
            }}
            title={`${a.symbol} ${(a.weight * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="alloc-legend">
        {allocation.map((a, i) => (
          <span key={a.symbol}>
            <span
              className="alloc-dot"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            {a.symbol} {(a.weight * 100).toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}
