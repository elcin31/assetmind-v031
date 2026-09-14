import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { toLocalDateTimeInputValue } from '../utils/format';

interface Props {
  code: string;
  currency: string;
  initialSymbol: string | null;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export function TransactionForm({
  code,
  currency,
  initialSymbol,
  onSuccess,
  onError,
}: Props) {
  const [symbol, setSymbol] = useState(initialSymbol ?? '');
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(() => toLocalDateTimeInputValue());
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    if (initialSymbol) {
      setSymbol(initialSymbol);
      idempotencyKey.current = null;
    }
  }, [initialSymbol]);

  useEffect(() => {
    const normalized = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9.\-]{1,20}$/.test(normalized)) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(normalized)}`, {
          headers: { Authorization: `Bearer ${code}` },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const q = await res.json();
        if (
          idempotencyKey.current === null &&
          typeof q.price === 'number' &&
          Number.isFinite(q.price) &&
          q.price > 0
        ) {
          setPrice(String(q.price));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [code, symbol]);

  const resetIdempotency = () => {
    idempotencyKey.current = null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const normalizedSymbol = symbol.trim().toUpperCase();
    const qty = Number(quantity);
    const px = Number(price);
    const timestamp = new Date(date);

    if (!/^[A-Z0-9.\-]{1,20}$/.test(normalizedSymbol)) {
      onError('Please enter a valid symbol.');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(px) || px <= 0) {
      onError('Please fill quantity and price with valid positive numbers.');
      return;
    }
    if (Number.isNaN(timestamp.getTime())) {
      onError('Please enter a valid transaction date and time.');
      return;
    }

    setSubmitting(true);
    onError('');
    idempotencyKey.current ??= crypto.randomUUID();

    try {
      const res = await fetch('/api/portfolio/transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${code}`,
        },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          transaction: {
            symbol: normalizedSymbol,
            type,
            quantity: qty,
            price: px,
            currency,
            timestamp: timestamp.toISOString(),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        onError(data.error || 'Transaction failed');
        return;
      }

      setQuantity('');
      idempotencyKey.current = null;
      onSuccess();
    } catch {
      onError('Network error while saving transaction');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <h2>New transaction</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="transaction-symbol">Symbol</label>
          <input
            id="transaction-symbol"
            className="input"
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value.toUpperCase());
              resetIdempotency();
            }}
            placeholder="AAPL"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>

        <div className="form-group">
          <span className="form-label">Type</span>
          <div className="tabs" role="group" aria-label="Transaction type">
            <button
              type="button"
              className={`tab ${type === 'BUY' ? 'active' : ''}`}
              onClick={() => { setType('BUY'); resetIdempotency(); }}
              aria-pressed={type === 'BUY'}
            >
              BUY
            </button>
            <button
              type="button"
              className={`tab ${type === 'SELL' ? 'active' : ''}`}
              onClick={() => { setType('SELL'); resetIdempotency(); }}
              aria-pressed={type === 'SELL'}
            >
              SELL
            </button>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="transaction-quantity">Quantity</label>
          <input
            id="transaction-quantity"
            className="input"
            type="number"
            inputMode="decimal"
            step="any"
            min="0.00000001"
            value={quantity}
            onChange={(e) => { setQuantity(e.target.value); resetIdempotency(); }}
            placeholder="10"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="transaction-price">Price ({currency})</label>
          <input
            id="transaction-price"
            className="input"
            type="number"
            inputMode="decimal"
            step="any"
            min="0.00000001"
            value={price}
            onChange={(e) => { setPrice(e.target.value); resetIdempotency(); }}
            placeholder="200.00"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="transaction-date">Date / time</label>
          <input
            id="transaction-date"
            className="input"
            type="datetime-local"
            value={date}
            onChange={(e) => { setDate(e.target.value); resetIdempotency(); }}
            required
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : `Submit ${type}`}
        </button>
      </form>
    </div>
  );
}
