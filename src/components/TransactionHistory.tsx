import { useState } from 'react';
import type { Transaction } from '../types';
import { deleteTransaction, updateTransaction } from '../storage/portfolio';
import { formatCurrency } from '../utils/format';
import './core-p0.css';

interface Draft {
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  timestamp: string;
}

function localDateTime(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function draftFrom(tx: Transaction): Draft {
  return {
    symbol: tx.symbol,
    type: tx.type,
    quantity: String(tx.quantity),
    price: String(tx.price),
    timestamp: localDateTime(tx.timestamp),
  };
}

export function TransactionHistory({
  transactions,
  userId,
  currency,
  onChanged,
  onError,
}: {
  transactions: Transaction[];
  userId: string;
  currency: string;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const money = (value: number) => formatCurrency(value, currency);
  const sorted = [...transactions].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const beginEdit = (tx: Transaction) => {
    setEditing(tx.id);
    setDraft(draftFrom(tx));
    setConfirmDelete(null);
    onError(null);
  };

  const save = async (tx: Transaction) => {
    if (!draft) return;
    const symbol = draft.symbol.trim().toUpperCase();
    const quantity = Number(draft.quantity);
    const price = Number(draft.price);
    const date = new Date(draft.timestamp);
    if (!/^[A-Z0-9.-]{1,20}$/.test(symbol) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0 || Number.isNaN(date.getTime())) {
      onError('Проверьте тикер, количество, цену и дату сделки.');
      return;
    }
    setSaving(true);
    onError(null);
    try {
      await updateTransaction(tx.id, {
        symbol,
        type: draft.type,
        quantity,
        price,
        currency: tx.currency,
        timestamp: date.toISOString(),
      }, userId);
      setEditing(null);
      setDraft(null);
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось изменить сделку.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tx: Transaction) => {
    if (confirmDelete !== tx.id) {
      setConfirmDelete(tx.id);
      return;
    }
    setSaving(true);
    onError(null);
    try {
      await deleteTransaction(tx.id, userId);
      setConfirmDelete(null);
      if (editing === tx.id) { setEditing(null); setDraft(null); }
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось удалить сделку.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <div className="section-heading">
        <h2>История сделок <span className="tag">{transactions.length}</span></h2>
        <span className="caption">Изменения пересчитывают позиции и аналитику</span>
      </div>
      {!transactions.length ? (
        <p className="empty">Начните с первой покупки. Позиции и лаборатория обновятся автоматически.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Актив</th><th>Операция</th><th>Количество</th><th>Цена</th><th>Дата</th><th aria-label="Действия" /></tr></thead>
            <tbody>
              {sorted.map((tx) => (
                editing === tx.id && draft ? (
                  <tr key={tx.id} className="transaction-edit-row">
                    <td colSpan={6}>
                      <div className="transaction-edit-grid">
                        <label>Тикер<input className="input" value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value.toUpperCase() })} /></label>
                        <label>Операция<select className="input" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as 'BUY' | 'SELL' })}><option>BUY</option><option>SELL</option></select></label>
                        <label>Количество<input className="input" type="number" step="any" min="0.00000001" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} /></label>
                        <label>Цена<input className="input" type="number" step="any" min="0.00000001" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></label>
                        <label>Дата и время<input className="input" type="datetime-local" value={draft.timestamp} onChange={(e) => setDraft({ ...draft, timestamp: e.target.value })} /></label>
                      </div>
                      <div className="transaction-actions">
                        <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save(tx)}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
                        <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => { setEditing(null); setDraft(null); }}>Отмена</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={tx.id}>
                    <td><b>{tx.symbol}</b></td>
                    <td><span className={`trade-badge ${tx.type === 'BUY' ? 'positive' : 'negative'}`}>{tx.type}</span></td>
                    <td>{tx.quantity}</td>
                    <td>{money(tx.price)}</td>
                    <td>{new Date(tx.timestamp).toLocaleDateString('ru-RU')}</td>
                    <td>
                      <div className="transaction-actions">
                        <button className="text-button" type="button" disabled={saving} onClick={() => beginEdit(tx)}>Изменить</button>
                        <button className={`text-button ${confirmDelete === tx.id ? 'negative' : ''}`} type="button" disabled={saving} onClick={() => void remove(tx)}>{confirmDelete === tx.id ? 'Подтвердить удаление' : 'Удалить'}</button>
                        {confirmDelete === tx.id && <button className="text-button" type="button" onClick={() => setConfirmDelete(null)}>Отмена</button>}
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
