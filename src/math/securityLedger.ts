import type { TradeTransaction, Transaction } from '../types';

/** Cash accounting only consumes executions that actually exchange cash. */
export function tradeTransactions(transactions: Transaction[]): TradeTransaction[] {
  return transactions.filter((tx): tx is TradeTransaction => tx.type === 'BUY' || tx.type === 'SELL');
}
