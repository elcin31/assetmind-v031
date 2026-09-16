import { useRef, useState } from 'react';
import type { CashEvent, CashEventKind, PortfolioSnapshot } from '../types';
import { addCashEvent, deleteCashEvent, updateCashEvent } from '../storage/planning';
import { formatCurrency } from '../utils/format';
import './core-p1.css';

const labels: Record<CashEventKind, string> = {
  DEPOSIT: 'Пополнение', WITHDRAWAL: 'Вывод', DIVIDEND: 'Дивиденд', FEE: 'Комиссия',
};

function localNow() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function localDateTime(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function CashLedgerPanel({ snapshot, userId, onChanged, onError }: {
  snapshot: PortfolioSnapshot;
  userId: string;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const events = snapshot.cashEvents ?? [];
  const [kind, setKind] = useState<CashEventKind>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [symbol, setSymbol] = useState('');
  const [timestamp, setTimestamp] = useState(localNow);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef<string | null>(null);
  const currency = snapshot.portfolio.base_currency;
  const portfolioId = snapshot.portfolio.id;

  const reset = () => {
    setKind('DEPOSIT'); setAmount(''); setSymbol(''); setTimestamp(localNow()); setEditing(null); requestId.current = null;
  };
  const beginEdit = (event: CashEvent) => {
    setEditing(event.id); setKind(event.kind); setAmount(String(event.amount)); setSymbol(event.symbol ?? ''); setTimestamp(localDateTime(event.timestamp)); setConfirmDelete(null); requestId.current = null; onError(null);
  };

  const submit = async () => {
    const numericAmount = Number(amount);
    const date = new Date(timestamp);
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || Number.isNaN(date.getTime()) || (normalizedSymbol && !/^[A-Z0-9.-]{1,20}$/.test(normalizedSymbol))) {
      onError('Проверьте сумму, дату и тикер денежной операции.'); return;
    }
    setSaving(true); onError(null);
    try {
      const input = { kind, amount: numericAmount, currency, timestamp: date.toISOString(), ...(normalizedSymbol ? { symbol: normalizedSymbol } : {}) };
      if (editing) await updateCashEvent(editing, input, userId, portfolioId, currency);
      else {
        requestId.current ??= crypto.randomUUID();
        await addCashEvent(input, requestId.current, userId, portfolioId, currency);
      }
      reset(); onChanged();
    } catch (error) { onError(error instanceof Error ? error.message : 'Не удалось сохранить денежную операцию.'); }
    finally { setSaving(false); }
  };

  const remove = async (event: CashEvent) => {
    if (confirmDelete !== event.id) { setConfirmDelete(event.id); return; }
    setSaving(true); onError(null);
    try {
      await deleteCashEvent(event.id, userId, portfolioId, currency);
      if (editing === event.id) reset();
      setConfirmDelete(null); onChanged();
    } catch (error) { onError(error instanceof Error ? error.message : 'Не удалось удалить денежную операцию.'); }
    finally { setSaving(false); }
  };

  const sorted = [...events].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const money = (value: number) => formatCurrency(value, currency);
  return (
    <section className="card cash-ledger-card">
      <div className="section-heading"><div><h2>Cash ledger <span className="tag">{events.length}</span></h2><p className="caption">DEPOSIT/WITHDRAWAL — внешние cash flows. DIVIDEND/FEE остаются внутри счёта.</p></div><span className="tag">{snapshot.cashLedger?.complete ? 'Reconciled' : 'Incomplete'}</span></div>
      <div className="cash-form-grid">
        <label>Тип<select className="input" value={kind} onChange={(e) => { setKind(e.target.value as CashEventKind); requestId.current = null; }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Сумма<input className="input" type="number" min="0.01" step="any" value={amount} onChange={(e) => { setAmount(e.target.value); requestId.current = null; }} placeholder="0.00" /></label>
        <label>Тикер <span className="caption">опционально</span><input className="input" value={symbol} onChange={(e) => { setSymbol(e.target.value.toUpperCase()); requestId.current = null; }} placeholder="AAPL" /></label>
        <label>Дата и время<input className="input" type="datetime-local" value={timestamp} onChange={(e) => { setTimestamp(e.target.value); requestId.current = null; }} /></label>
      </div>
      <div className="transaction-actions">
        <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void submit()}>{saving ? 'Сохранение…' : editing ? 'Сохранить изменения' : 'Добавить cash event'}</button>
        {editing && <button className="btn btn-ghost" type="button" disabled={saving} onClick={reset}>Отмена</button>}
      </div>
      {snapshot.cashLedger?.reason && <p className="notice">{snapshot.cashLedger.reason}</p>}
      {!sorted.length ? <p className="empty">Cash events пока нет. Для старого портфеля начните с исторического DEPOSIT до первой покупки.</p> : <div className="table-scroll"><table><thead><tr><th>Тип</th><th>Сумма</th><th>Тикер</th><th>Дата</th><th aria-label="Действия" /></tr></thead><tbody>{sorted.map((event) => {
        const positive = event.kind === 'DEPOSIT' || event.kind === 'DIVIDEND';
        return <tr key={event.id}><td><span className={`trade-badge ${positive ? 'positive' : 'negative'}`}>{event.kind}</span></td><td>{positive ? '+' : '−'}{money(event.amount)}</td><td>{event.symbol ?? '—'}</td><td>{new Date(event.timestamp).toLocaleDateString('ru-RU')}</td><td><div className="transaction-actions"><button className="text-button" type="button" disabled={saving} onClick={() => beginEdit(event)}>Изменить</button><button className={`text-button ${confirmDelete === event.id ? 'negative' : ''}`} type="button" disabled={saving} onClick={() => void remove(event)}>{confirmDelete === event.id ? 'Подтвердить' : 'Удалить'}</button>{confirmDelete === event.id && <button className="text-button" type="button" onClick={() => setConfirmDelete(null)}>Отмена</button>}</div></td></tr>;
      })}</tbody></table></div>}
    </section>
  );
}
