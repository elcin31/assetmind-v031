import { useMemo, useState } from 'react';
import type { PortfolioAnalytics } from '../math/analytics';
import type { Position } from '../types';
import { formatCurrency } from '../utils/format';
import { numeric, pct } from '../utils/analyticsFormat';
import { Formula } from './AnalyticsMetric';

type SortKey = 'symbol' | 'marketValue' | 'weight' | 'realizedPnL' | 'unrealizedPnL' | 'totalPnL' | 'positionReturn' | 'returnContribution' | 'riskContribution' | 'beta' | 'correlation';

export function AttributionPanel({
  analytics: a,
  currency,
  positions,
}: {
  analytics: PortfolioAnalytics;
  currency: string;
  positions: Position[];
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: 'totalPnL', direction: -1 });
  const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? 'Недостаточно данных' : formatCurrency(value, currency);
  const pnlTotals = useMemo(() => {
    const sum = (key: 'realizedPnL' | 'unrealizedPnL' | 'totalPnL') => {
      if (!a.pnl.length || a.pnl.some((item) => item[key] === null || !Number.isFinite(item[key]))) return null;
      const result = a.pnl.reduce((total, item) => total + item[key]!, 0);
      return Number.isFinite(result) ? result : null;
    };
    return { realized: sum('realizedPnL'), unrealized: sum('unrealizedPnL'), total: sum('totalPnL') };
  }, [a.pnl]);
  const rows = useMemo(() => {
    const bySymbol = new Map(positions.map((position) => [position.symbol, position]));
    const returns = new Map(a.contributions.map((item) => [item.symbol, item.value]));
    const values = a.pnl.map((item) => {
      const position = bySymbol.get(item.symbol);
      const detail = a.details[item.symbol];
      return {
        symbol: item.symbol,
        marketValue: position?.marketValue ?? null,
        weight: detail?.weight ?? null,
        realizedPnL: item.realizedPnL,
        unrealizedPnL: item.unrealizedPnL,
        totalPnL: item.totalPnL,
        positionReturn: detail?.positionReturn ?? null,
        returnContribution: returns.get(item.symbol) ?? null,
        riskContribution: detail?.riskContribution ?? null,
        beta: detail?.beta ?? null,
        correlation: detail?.correlation ?? null,
        barWidth: item.barWidth,
      };
    });
    return values.sort((left, right) => {
      const l = left[sort.key]; const r = right[sort.key];
      if (typeof l === 'string' && typeof r === 'string') return l.localeCompare(r) * sort.direction;
      return ((typeof r === 'number' && Number.isFinite(r) ? r : -Infinity) - (typeof l === 'number' && Number.isFinite(l) ? l : -Infinity)) * sort.direction;
    });
  }, [a.contributions, a.details, a.pnl, positions, sort]);
  const ranked = a.pnl.filter((item) => item.totalPnL !== null && Number.isFinite(item.totalPnL));
  const contributors = [...ranked].filter((item) => item.totalPnL! > 0).sort((x, y) => y.totalPnL! - x.totalPnL!).slice(0, 3);
  const detractors = [...ranked].filter((item) => item.totalPnL! < 0).sort((x, y) => x.totalPnL! - y.totalPnL!).slice(0, 3);
  const updateSort = (key: SortKey) => setSort((current) => ({ key, direction: current.key === key ? current.direction === 1 ? -1 : 1 : -1 }));

  return (
    <div className="lab-grid attribution-lab">
      <section className="card attribution-overview">
        <div className="section-heading"><div><h2>Attribution Overview</h2><p className="caption">P&amp;L за всё время операций · Weighted Average Cost.</p></div><span className="tag">Lifetime</span></div>
        <div className="analytics-metrics">
          <AttributionMetric label="Total P&amp;L" value={pnlTotals.total} money={money} />
          <AttributionMetric label="Realized P&amp;L" value={pnlTotals.realized} money={money} />
          <AttributionMetric label="Unrealized P&amp;L" value={pnlTotals.unrealized} money={money} />
        </div>
      </section>
      <section className="card attribution-ranking-grid">
        <Ranking title="Top Contributors" rows={contributors} money={money} positive />
        <Ranking title="Top Detractors" rows={detractors} money={money} />
        <div><h2>Largest Risk Contributors</h2>{[...positions].sort((x, y) => (a.details[y.symbol]?.riskContribution ?? -Infinity) - (a.details[x.symbol]?.riskContribution ?? -Infinity)).slice(0, 3).map((position) => <div className="metric-row" key={position.symbol}><span>{position.symbol}</span><b>{a.details[position.symbol]?.riskContribution == null ? 'Недостаточно данных' : pct(a.details[position.symbol].riskContribution!)}</b></div>)}</div>
      </section>
      <section className="card">
        <div className="section-heading"><div><h2>Attribution by Position</h2><p className="caption">P&amp;L contribution — денежный результат; return contribution — связанный процентный вклад; risk contribution — доля annualized volatility.</p></div><span className="tag">{a.pnl.length} позиций за время операций</span></div>
        {!a.pnl.length ? <p className="empty">Нет операций для атрибуции.</p> : <div className="table-scroll attribution-table-scroll"><table className="attribution-table"><thead><tr>
          {([['symbol','Symbol'],['marketValue','Market Value'],['weight','Weight'],['realizedPnL','Realized P&L'],['unrealizedPnL','Unrealized P&L'],['totalPnL','Total P&L'],['positionReturn','Position Return %'],['returnContribution','Return Contribution'],['riskContribution','Risk Contribution %'],['beta','Beta'],['correlation','Correlation']] as [SortKey,string][]).map(([key,label]) => <th key={key}><button className="table-sort" type="button" aria-label={`Сортировать по ${label}`} onClick={() => updateSort(key)}>{label}{sort.key === key ? sort.direction === 1 ? ' ↑' : ' ↓' : ''}</button></th>)}
        </tr></thead><tbody>{rows.map((row) => <tr key={row.symbol}><th scope="row">{row.symbol}</th><td>{money(row.marketValue)}</td><td>{row.weight == null ? 'Недостаточно данных' : pct(row.weight)}</td><td>{money(row.realizedPnL)}</td><td>{money(row.unrealizedPnL)}</td><td className={row.totalPnL === null ? '' : row.totalPnL < 0 ? 'negative' : 'positive'}>{money(row.totalPnL)}</td><td>{row.positionReturn == null ? 'Недостаточно данных' : pct(row.positionReturn)}</td><td>{row.returnContribution == null ? 'Недостаточно данных' : pct(row.returnContribution)}</td><td>{row.riskContribution == null ? 'Недостаточно данных' : pct(row.riskContribution)}</td><td>{row.beta == null ? 'Недостаточно данных' : numeric(row.beta)}</td><td>{row.correlation == null ? 'Недостаточно данных' : numeric(row.correlation)}</td></tr>)}</tbody></table></div>}
        <Formula name="P&amp;L, return and risk contribution" formula="PnLᵢ=Realizedᵢ+Unrealizedᵢ · Cᵢ=ΣₜWₜ₋₁wᵢ,ₜ₋₁rᵢ,ₜ · RC%ᵢ=RCᵢ/σₚ">P&amp;L использует существующую Weighted Average Cost логику. Return Contribution показывается только при корректных позиционных историях и известных весах. Если точная атрибуция за период недоступна, вместо неё нельзя трактовать P&amp;L как доходность. {a.contributionReason ?? `Return contribution использует период ${a.sample}.`}</Formula>
      </section>
    </div>
  );
}

function AttributionMetric({ label, value, money }: { label: string; value: number | null; money: (value: number | null) => string }) {
  return <div className="analytics-metric"><span>{label}</span><strong>{money(value)}</strong></div>;
}

function Ranking({ title, rows, money, positive = false }: { title: string; rows: { symbol: string; totalPnL: number | null; barWidth: number }[]; money: (value: number | null) => string; positive?: boolean }) {
  return <div><h2>{title}</h2>{!rows.length ? <p className="caption">Нет позиций с таким знаком P&amp;L.</p> : rows.map((item) => <div className="attribution-row" key={item.symbol}><div className="metric-row"><b>{item.symbol}</b><strong className={positive ? 'positive' : 'negative'}>{money(item.totalPnL)}</strong></div><div className="contribution-track"><i style={{ width: `${item.barWidth}%`, background: positive ? 'var(--positive)' : 'var(--negative)' }} /></div></div>)}</div>;
}
