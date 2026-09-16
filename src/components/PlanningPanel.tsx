import { useState } from 'react';
import type { PortfolioSnapshot, TargetAllocation } from '../types';
import { updateTargetAllocation } from '../storage/planning';
import { buildRebalancePlan, simulateTradeWhatIf, targetCashWeight, type WhatIfResult } from '../math/rebalancing';
import { formatCurrency } from '../utils/format';
import { pct } from '../utils/analyticsFormat';
import './core-p1.css';

function initialDraft(snapshot: PortfolioSnapshot) {
  const saved = snapshot.targetAllocation ?? [];
  const source = saved.length ? saved : snapshot.allocation.map((row) => ({ symbol: row.symbol, weight: row.weight }));
  return Object.fromEntries(source.map((row) => [row.symbol, String(Math.round(row.weight * 10_000) / 100)]));
}

export function PlanningPanel({ snapshot, userId, onChanged, onError }: {
  snapshot: PortfolioSnapshot;
  userId: string;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [weights, setWeights] = useState<Record<string, string>>(() => initialDraft(snapshot));
  const [saving, setSaving] = useState(false);
  const [whatSymbol, setWhatSymbol] = useState(snapshot.positions[0]?.symbol ?? '');
  const [whatType, setWhatType] = useState<'BUY' | 'SELL'>('BUY');
  const [whatQuantity, setWhatQuantity] = useState('1');
  const [whatPrice, setWhatPrice] = useState(String(snapshot.positions[0]?.marketPrice ?? ''));
  const [whatIf, setWhatIf] = useState<WhatIfResult | null>(null);
  const currency = snapshot.portfolio.base_currency;
  const symbols = [...new Set([...snapshot.positions.map((p) => p.symbol), ...Object.keys(weights)])].sort();

  const draftTargets = (): TargetAllocation[] => symbols.flatMap((symbol) => {
    const percent = Number(weights[symbol] ?? 0);
    return Number.isFinite(percent) && percent > 0 ? [{ symbol, weight: percent / 100 }] : [];
  });
  const parsedTargets = (() => { try { return draftTargets(); } catch { return []; } })();
  const totalTarget = parsedTargets.reduce((sum, target) => sum + target.weight, 0);
  const savedTargets = snapshot.targetAllocation ?? [];
  const plan = buildRebalancePlan(snapshot.positions, snapshot.cashLedger?.balance ?? 0, savedTargets, Boolean(snapshot.cashLedger?.complete), snapshot.valuation.complete);
  const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : formatCurrency(value, currency);

  const saveTargets = async () => {
    setSaving(true); onError(null);
    try {
      const targets = draftTargets();
      if (targets.reduce((sum, target) => sum + target.weight, 0) > 1.000001) throw new Error('Сумма target weights превышает 100%.');
      await updateTargetAllocation(targets, userId, snapshot.portfolio.id, currency);
      onChanged();
    } catch (error) { onError(error instanceof Error ? error.message : 'Не удалось сохранить target allocation.'); }
    finally { setSaving(false); }
  };

  const runWhatIf = () => {
    const quantity = Number(whatQuantity); const price = Number(whatPrice);
    const result = simulateTradeWhatIf(snapshot.positions, snapshot.cashLedger?.balance ?? 0, savedTargets, Boolean(snapshot.cashLedger?.complete), snapshot.valuation.complete, { symbol: whatSymbol, type: whatType, quantity, price });
    setWhatIf(result);
  };

  return (
    <section className="card planning-card">
      <div className="section-heading"><div><h2>Targets & Rebalancing</h2><p className="caption">Целевые веса считаются от полной стоимости счёта. Остаток до 100% автоматически становится target CASH.</p></div><span className="tag">Drift {pct(plan.drift)}</span></div>
      {!symbols.length ? <p className="empty">Добавьте активы, чтобы задать target allocation.</p> : <>
        <div className="target-grid">{symbols.map((symbol) => <label key={symbol}><span>{symbol}</span><div className="target-input"><input className="input" type="number" min="0" max="100" step="0.1" value={weights[symbol] ?? ''} onChange={(e) => setWeights({ ...weights, [symbol]: e.target.value })} /><span>%</span></div></label>)}</div>
        <div className="planning-summary"><span>Сумма активов <b>{pct(totalTarget)}</b></span><span>Target CASH <b>{pct(Math.max(0, 1 - totalTarget))}</b></span><button className="btn btn-primary" type="button" disabled={saving} onClick={() => void saveTargets()}>{saving ? 'Сохранение…' : 'Сохранить targets'}</button></div>
      </>}

      {plan.reason ? <p className="notice">{plan.reason}</p> : <div className="table-scroll"><table><thead><tr><th>Актив</th><th>Сейчас</th><th>Target</th><th>Δ value</th><th>Действие</th><th>≈ qty</th></tr></thead><tbody>{plan.rows.map((row) => <tr key={row.symbol}><td><b>{row.symbol}</b></td><td>{pct(row.currentWeight)}</td><td>{pct(row.targetWeight)}</td><td className={row.delta > 0 ? 'positive' : row.delta < 0 ? 'negative' : ''}>{row.delta > 0 ? '+' : ''}{money(row.delta)}</td><td><span className={`trade-badge ${row.action === 'BUY' ? 'positive' : row.action === 'SELL' ? 'negative' : ''}`}>{row.action}</span></td><td>{row.quantity == null ? '—' : row.quantity.toLocaleString('ru-RU', { maximumFractionDigits: 4 })}</td></tr>)}</tbody></table><div className="planning-cash-row">Cash сейчас: <b>{pct(plan.cashWeight)}</b> · target: <b>{pct(plan.targetCashWeight)}</b></div></div>}

      <div className="what-if-block"><div><h3>Pre-trade What‑If</h3><p className="caption">Показывает влияние сделки на cash, концентрацию и target drift до отправки реальной операции.</p></div><div className="what-if-grid"><label>Актив<select className="input" value={whatSymbol} onChange={(e) => { const symbol = e.target.value; setWhatSymbol(symbol); setWhatPrice(String(snapshot.positions.find((p) => p.symbol === symbol)?.marketPrice ?? '')); setWhatIf(null); }}>{snapshot.positions.map((position) => <option key={position.symbol}>{position.symbol}</option>)}</select></label><label>Операция<select className="input" value={whatType} onChange={(e) => { setWhatType(e.target.value as 'BUY' | 'SELL'); setWhatIf(null); }}><option>BUY</option><option>SELL</option></select></label><label>Количество<input className="input" type="number" min="0.000001" step="any" value={whatQuantity} onChange={(e) => { setWhatQuantity(e.target.value); setWhatIf(null); }} /></label><label>Цена<input className="input" type="number" min="0.000001" step="any" value={whatPrice} onChange={(e) => { setWhatPrice(e.target.value); setWhatIf(null); }} /></label><button className="btn btn-ghost" type="button" onClick={runWhatIf}>Рассчитать</button></div>
        {whatIf && (whatIf.valid ? <div className="what-if-result"><span>Cash <b>{money(whatIf.cashBefore)} → {money(whatIf.cashAfter)}</b></span><span>Largest weight <b>{pct(whatIf.largestWeightBefore)} → {pct(whatIf.largestWeightAfter)}</b></span><span>Target drift <b>{pct(whatIf.targetDriftBefore)} → {pct(whatIf.targetDriftAfter)}</b></span></div> : <p className="notice">{whatIf.reason}</p>)}
      </div>
      {savedTargets.length > 0 && <p className="caption">Сохранённый target CASH: {pct(targetCashWeight(savedTargets))}. Rebalance — математическая подсказка, без налогов, комиссий и автоматического исполнения.</p>}
    </section>
  );
}
