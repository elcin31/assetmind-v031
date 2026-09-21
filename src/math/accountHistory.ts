import type { CashEvent, HistoryBar, StockSplit, Transaction } from '../types';
import type { PortfolioHistory, PortfolioHistoryPoint } from '../types/analytics';
import { buildCashLedger } from './cashLedger';
import { compareTransactions } from './positions';
import { flowAdjustedReturn } from './performance';
import { EPSILON, validDate } from './statistics';

type AccountOperation =
  | {
      kind: 'security';
      id: string;
      day: string;
      timestamp: string;
      createdAt: string;
      transaction: Transaction;
    }
  | {
      kind: 'cash';
      id: string;
      day: string;
      timestamp: string;
      createdAt: string;
      event: CashEvent;
    };

export interface AccountHistoryMarketData {
  /** Provider-reported splits. Held splits require a matching canonical SPLIT ledger row. */
  splits?: Map<string, StockSplit[]>;
  /** First actually observed raw valuation bar for each symbol. */
  coverageStarts?: Map<string, string>;
}

function operationOrder(a: AccountOperation, b: AccountOperation): number {
  const byTimestamp = Date.parse(a.timestamp) - Date.parse(b.timestamp);
  if (Number.isFinite(byTimestamp) && byTimestamp !== 0) return byTimestamp;
  const byCreated = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (Number.isFinite(byCreated) && byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

function cashDelta(event: CashEvent): { delta: number; external: number; externalFlow: boolean } {
  if (event.kind === 'DEPOSIT') return { delta: event.amount, external: event.amount, externalFlow: true };
  if (event.kind === 'WITHDRAWAL') return { delta: -event.amount, external: -event.amount, externalFlow: true };
  if (event.kind === 'DIVIDEND') return { delta: event.amount, external: 0, externalFlow: false };
  return { delta: -event.amount, external: 0, externalFlow: false };
}

function splitRatio(transaction: Extract<Transaction, { type: 'SPLIT' }>): number {
  return transaction.split_numerator / transaction.split_denominator;
}

function hasMatchingLedgerSplit(
  transactions: Transaction[],
  symbol: string,
  split: StockSplit,
): boolean {
  return transactions.some((transaction) =>
    transaction.type === 'SPLIT' &&
    transaction.symbol.trim().toUpperCase() === symbol &&
    transaction.timestamp.slice(0, 10) === split.date &&
    Math.abs(splitRatio(transaction) - split.ratio) <= 1e-9
  );
}

function quantityHeldBeforeSplit(
  transactions: Transaction[],
  symbol: string,
  split: StockSplit,
): number {
  const splitTime = Date.parse(split.timestamp);
  if (!Number.isFinite(splitTime)) return 0;
  let quantity = 0;
  for (const transaction of [...transactions].sort(compareTransactions)) {
    if (transaction.symbol.trim().toUpperCase() !== symbol) continue;
    const transactionTime = Date.parse(transaction.timestamp);
    if (!Number.isFinite(transactionTime) || transactionTime >= splitTime) break;
    if (transaction.type === 'BUY') quantity += transaction.quantity;
    else if (transaction.type === 'SELL') quantity -= transaction.quantity;
    else quantity *= splitRatio(transaction);
  }
  return quantity;
}

function relevantUnrecordedHeldSplit(
  transactions: Transaction[],
  marketData: AccountHistoryMarketData,
  asOf: string,
): { symbol: string; split: StockSplit } | null {
  for (const [rawSymbol, splits] of marketData.splits ?? []) {
    const symbol = rawSymbol.trim().toUpperCase();
    for (const split of splits) {
      if (split.date > asOf) continue;
      if (quantityHeldBeforeSplit(transactions, symbol, split) <= EPSILON) continue;
      if (hasMatchingLedgerSplit(transactions, symbol, split)) continue;
      return { symbol, split };
    }
  }
  return null;
}

/** Reconstruct actual end-of-day account value from historical holdings plus the explicit cash ledger. */
export function reconstructAccountHistory(
  transactions: Transaction[],
  cashEvents: CashEvent[],
  histories: Map<string, HistoryBar[]>,
  asOf: string,
  marketData: AccountHistoryMarketData = {},
): PortfolioHistory {
  const empty = (reason: string, missingSymbols: string[] = []): PortfolioHistory => ({
    points: [], missingDates: [], missingSymbols, reason,
  });

  if (!validDate(asOf)) return empty('Некорректная дата оценки.');
  if (!transactions.length) return empty('Добавьте первую сделку.');

  const invalidTransaction = transactions.some((transaction) => {
    if (
      !Number.isFinite(Date.parse(transaction.timestamp)) ||
      !Number.isFinite(Date.parse(transaction.created_at)) ||
      !transaction.symbol.trim() ||
      !transaction.id
    ) return true;
    if (transaction.type === 'SPLIT') {
      return !Number.isFinite(transaction.split_numerator) ||
        transaction.split_numerator <= 0 ||
        !Number.isFinite(transaction.split_denominator) ||
        transaction.split_denominator <= 0 ||
        Math.abs(transaction.split_numerator - transaction.split_denominator) <= EPSILON;
    }
    return !Number.isFinite(transaction.quantity) || transaction.quantity <= 0 ||
      !Number.isFinite(transaction.price) || transaction.price <= 0;
  });
  const invalidCashEvent = cashEvents.some(
    (event) =>
      !event.id ||
      !['DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE'].includes(event.kind) ||
      !Number.isFinite(event.amount) || event.amount <= 0 ||
      !Number.isFinite(Date.parse(event.timestamp)) ||
      !Number.isFinite(Date.parse(event.created_at)),
  );
  const ids = [...transactions.map((transaction) => transaction.id), ...cashEvents.map((event) => event.id)];
  const currencies = new Set([...transactions.map((transaction) => transaction.currency), ...cashEvents.map((event) => event.currency)]);
  if (invalidTransaction || invalidCashEvent || new Set(ids).size !== ids.length || currencies.size > 1) {
    return empty('Некорректные операции или смешанные валюты без FX-истории.');
  }

  const cutoff = `${asOf}T23:59:59.999Z`;
  const eligibleTransactions = [...transactions]
    .sort(compareTransactions)
    .map((transaction) => ({
      ...transaction,
      symbol: transaction.symbol.trim().toUpperCase(),
      day: new Date(transaction.timestamp).toISOString().slice(0, 10),
    }))
    .filter((transaction) => transaction.day <= asOf);
  const eligibleCashEvents = [...cashEvents]
    .map((event) => ({ ...event, day: new Date(event.timestamp).toISOString().slice(0, 10) }))
    .filter((event) => event.day <= asOf);
  const eligibleTrades = eligibleTransactions.filter(
    (transaction): transaction is Extract<typeof transaction, { type: 'BUY' | 'SELL' }> =>
      transaction.type === 'BUY' || transaction.type === 'SELL',
  );

  if (!eligibleTrades.length) return empty('До даты оценки нет сделок.');

  const symbols = [...new Set(eligibleTrades.map((transaction) => transaction.symbol))];
  const unavailableRawSymbols = symbols.filter((symbol) => !(histories.get(symbol)?.length));
  if (unavailableRawSymbols.length) {
    return empty(`Фактическая история счёта недоступна: нет raw close для ${unavailableRawSymbols.join(', ')}. Adjusted close не подставляется вместо фактической цены.`, unavailableRawSymbols);
  }

  if (marketData.coverageStarts) {
    for (const symbol of symbols) {
      const firstTransaction = eligibleTrades.find((transaction) => transaction.symbol === symbol);
      const coverageStart = marketData.coverageStarts.get(symbol);
      if (!firstTransaction || !coverageStart || !validDate(coverageStart)) {
        return empty(`Фактическая история счёта недоступна: не подтверждена полная raw-price coverage для ${symbol}.`, [symbol]);
      }
      if (firstTransaction.day < coverageStart) {
        return empty(`Фактическая история счёта недоступна: первая сделка ${symbol} (${firstTransaction.day}) старше первой фактически доступной raw-price точки (${coverageStart}).`, [symbol]);
      }
    }
  }

  const heldSplit = relevantUnrecordedHeldSplit(eligibleTransactions, marketData, asOf);
  if (heldSplit) {
    const { symbol, split } = heldSplit;
    return empty(`Фактическая история счёта недоступна: обнаружен stock split ${symbol} ${split.numerator}:${split.denominator} от ${split.date}, но в canonical transaction ledger нет соответствующей SPLIT-записи. AssetMind не подменяет ledger локальной поправкой графика.`, [symbol]);
  }

  const ledger = buildCashLedger(eligibleTransactions, eligibleCashEvents, cutoff);
  if (!ledger.complete) return empty(ledger.reason ?? 'Cash ledger неполный. Добавьте фактические пополнения до соответствующих покупок.');

  const prices = new Map<string, Map<string, number>>();
  const calendar = new Set<string>();
  const missingSymbols = new Set<string>();
  for (const symbol of symbols) {
    const map = new Map<string, number>();
    for (const bar of histories.get(symbol) ?? []) {
      if (validDate(bar.date) && bar.date <= asOf && Number.isFinite(bar.close) && bar.close > 0) {
        map.set(bar.date, bar.close);
        calendar.add(bar.date);
      }
    }
    if (!map.size) missingSymbols.add(symbol);
    prices.set(symbol, map);
  }

  const operations: AccountOperation[] = [
    ...eligibleTransactions.map<AccountOperation>((transaction) => ({
      kind: 'security', id: transaction.id, day: transaction.day,
      timestamp: transaction.timestamp, createdAt: transaction.created_at, transaction,
    })),
    ...eligibleCashEvents.map<AccountOperation>((event) => ({
      kind: 'cash', id: event.id, day: event.day,
      timestamp: event.timestamp, createdAt: event.created_at, event,
    })),
  ].sort(operationOrder);

  const firstOperationDay = operations[0]?.day ?? eligibleTrades[0].day;
  const dates = [...calendar].filter((date) => date >= firstOperationDay).sort();
  const quantities = new Map<string, number>();
  const points: PortfolioHistoryPoint[] = [];
  const missingDates: string[] = [];
  let cash = 0;
  let operationIndex = 0;
  let gap = false;
  let pendingExternalFlow = 0;
  let pendingExternalFlowOccurred = false;

  for (const date of dates) {
    let traded = false;
    while (operationIndex < operations.length && operations[operationIndex].day <= date) {
      const operation = operations[operationIndex++];
      if (operation.kind === 'security') {
        const transaction = operation.transaction;
        const currentQuantity = quantities.get(transaction.symbol) ?? 0;
        if (transaction.type === 'SPLIT') {
          const nextQuantity = currentQuantity * splitRatio(transaction);
          if (!Number.isFinite(nextQuantity) || nextQuantity < -EPSILON) {
            return empty('Некорректная история: stock split создал недопустимое количество позиции.');
          }
          quantities.set(transaction.symbol, Math.abs(nextQuantity) < EPSILON ? 0 : nextQuantity);
          continue;
        }
        const nextQuantity = currentQuantity + (transaction.type === 'BUY' ? transaction.quantity : -transaction.quantity);
        if (nextQuantity < -EPSILON || !Number.isFinite(nextQuantity)) return empty('Некорректная история: продажа превышает доступную позицию.');
        quantities.set(transaction.symbol, Math.max(0, nextQuantity));
        const notional = transaction.quantity * transaction.price;
        cash += transaction.type === 'BUY' ? -notional : notional;
        traded = true;
      } else {
        const flow = cashDelta(operation.event);
        cash += flow.delta;
        pendingExternalFlow += flow.external;
        pendingExternalFlowOccurred ||= flow.externalFlow;
      }
    }

    let securitiesValue = 0;
    let missing = false;
    for (const [symbol, quantity] of quantities) {
      if (quantity <= EPSILON) continue;
      const price = prices.get(symbol)?.get(date);
      if (price === undefined) { missing = true; missingSymbols.add(symbol); }
      else securitiesValue += quantity * price;
    }

    const value = securitiesValue + cash;
    if (missing || !Number.isFinite(value) || value < -EPSILON) {
      missingDates.push(date); gap = true; continue;
    }

    const previous = points.at(-1);
    const dailyReturn = previous && !gap && !pendingExternalFlowOccurred ? flowAdjustedReturn(previous.value, value, 0) : null;
    points.push({
      date, value: Math.abs(value) < EPSILON ? 0 : value, traded,
      externalFlow: pendingExternalFlow, externalFlowOccurred: pendingExternalFlowOccurred, dailyReturn,
    });
    gap = false;
    pendingExternalFlow = 0;
    pendingExternalFlowOccurred = false;
  }

  return {
    points,
    missingDates,
    missingSymbols: [...missingSymbols],
    reason: points.length ? null : 'Недостаточно полной raw-close истории цен для восстановления стоимости счёта.',
  };
}
