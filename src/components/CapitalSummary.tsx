import type { PortfolioSnapshot } from '../types';
import { formatCurrency } from '../utils/format';
import { pct } from '../utils/analyticsFormat';
import './core-p1.css';

export function CapitalSummary({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const ledger = snapshot.cashLedger;
  const mwr = snapshot.moneyWeighted;
  const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : formatCurrency(value, snapshot.portfolio.base_currency);
  const externalNet = ledger ? ledger.deposits - ledger.withdrawals : null;

  return (
    <section className="card capital-summary-card">
      <div className="section-heading">
        <div><h2>Capital & MWR</h2><p className="caption">Денежный остаток, внешний капитал и money-weighted return без догадок о пропущенных пополнениях.</p></div>
        <span className="tag">{ledger?.complete ? 'Reconciled' : 'Нужны cash flows'}</span>
      </div>
      <div className="capital-metrics">
        <div><span>Account value</span><b>{money(snapshot.accountValue)}</b></div>
        <div><span>Cash</span><b>{ledger?.complete ? money(ledger.balance) : '—'}</b></div>
        <div><span>Net external capital</span><b>{money(externalNet)}</b></div>
        <div><span>XIRR / MWR</span><b>{pct(mwr?.xirr)}</b></div>
      </div>
      {ledger?.reason && <p className="notice">{ledger.reason}</p>}
      {!ledger?.reason && mwr?.reason && <p className="notice">{mwr.reason}</p>}
    </section>
  );
}
