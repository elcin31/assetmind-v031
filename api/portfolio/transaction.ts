import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getInviteCode, isInviteCodeShapeValid } from '../../server/auth';
import { getSupabaseServer } from '../../server/supabaseServer';
import type { TransactionType } from '../../src/types';

interface TransactionBody {
  idempotencyKey?: string;
  transaction?: {
    symbol?: string;
    type?: string;
    quantity?: number;
    price?: number;
    currency?: string;
    timestamp?: string;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const code = getInviteCode(req);
  if (!isInviteCodeShapeValid(code)) {
    return res.status(401).json({ error: 'Invalid or missing invite code' });
  }

  let body: TransactionBody;
  try {
    const parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    body = parsed as TransactionBody;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const idempotencyKey =
    typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  if (!UUID_RE.test(idempotencyKey)) {
    return res.status(400).json({ error: 'Invalid or missing idempotency key' });
  }

  const tx = body.transaction;
  if (!tx || typeof tx !== 'object') {
    return res.status(400).json({ error: 'Missing transaction object' });
  }

  const symbol = typeof tx.symbol === 'string' ? tx.symbol.trim().toUpperCase() : '';
  const type = typeof tx.type === 'string' ? tx.type.trim().toUpperCase() : '';
  const quantity = Number(tx.quantity);
  const price = Number(tx.price);
  const currency =
    typeof tx.currency === 'string' ? tx.currency.trim().toUpperCase() : 'USD';
  const timestamp =
    typeof tx.timestamp === 'string' ? tx.timestamp : new Date().toISOString();

  if (!symbol || symbol.length > 20 || !/^[A-Z0-9.\-]+$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }
  if (type !== 'BUY' && type !== 'SELL') {
    return res.status(400).json({ error: 'type must be BUY or SELL' });
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'quantity must be a positive number' });
  }
  if (!Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: 'price must be a positive number' });
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({ error: 'currency must be a 3-letter ISO code' });
  }

  const tsDate = new Date(timestamp);
  if (Number.isNaN(tsDate.getTime())) {
    return res.status(400).json({ error: 'Invalid timestamp' });
  }

  try {
    const supabase = getSupabaseServer();
    const { data: inserted, error } = await supabase
      .rpc('add_portfolio_transaction', {
        p_code: code,
        p_client_request_id: idempotencyKey,
        p_symbol: symbol,
        p_type: type as TransactionType,
        p_quantity: quantity,
        p_price: price,
        p_currency: currency,
        p_timestamp: tsDate.toISOString(),
      })
      .single();

    if (error) {
      const message = error.message ?? '';
      if (message.includes('INVALID_INVITE_CODE')) {
        return res.status(401).json({ error: 'Invalid or inactive invite code' });
      }
      if (message.includes('SELL_QUANTITY_EXCEEDS_AVAILABLE_POSITION')) {
        return res.status(400).json({ error: 'SELL quantity exceeds available position' });
      }
      if (message.includes('CURRENCY_MISMATCH')) {
        return res.status(400).json({ error: 'Transaction currency must match portfolio currency' });
      }
      if (message.includes('IDEMPOTENCY_KEY_REUSED')) {
        return res.status(409).json({ error: 'Idempotency key was reused for a different transaction' });
      }

      console.error('transaction RPC error', error);
      return res.status(502).json({ error: 'Failed to save transaction' });
    }

    return res.status(201).json({ transaction: inserted });
  } catch (err) {
    console.error('transaction POST error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
