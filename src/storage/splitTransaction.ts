import type { SplitTransaction, Transaction } from '../types';

export interface CloudSplitTransactionRow {
  transaction_id: string;
  portfolio_id: string;
  type: 'SPLIT';
  symbol: string;
  currency: string;
  split_numerator: number;
  split_denominator: number;
  executed_at: string;
  recorded_at: string | null;
  created_at: string | null;
  client_request_id: string | null;
}

export function splitToCloudTransaction(tx: SplitTransaction, userId: string, portfolioId: string) {
  return {
    user_id: userId,
    portfolio_id: portfolioId,
    transaction_id: tx.id,
    date: tx.timestamp.slice(0, 10),
    type: 'SPLIT' as const,
    symbol: tx.symbol,
    quantity: null,
    price: null,
    fees: 0,
    amount: null,
    currency: tx.currency,
    split_numerator: tx.split_numerator,
    split_denominator: tx.split_denominator,
    executed_at: tx.timestamp,
    recorded_at: tx.created_at,
    source: 'assetmind-web',
    client_request_id: tx.client_request_id ?? null,
  };
}

export function splitFromCloudTransaction(row: CloudSplitTransactionRow): Transaction {
  return {
    id: row.transaction_id,
    portfolio_id: row.portfolio_id,
    symbol: row.symbol.trim().toUpperCase(),
    type: 'SPLIT',
    split_numerator: Number(row.split_numerator),
    split_denominator: Number(row.split_denominator),
    currency: row.currency,
    timestamp: row.executed_at,
    created_at: row.recorded_at ?? row.created_at ?? row.executed_at,
    ...(row.client_request_id ? { client_request_id: row.client_request_id } : {}),
  };
}
