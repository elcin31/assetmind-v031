import { describe, expect, it } from 'vitest';
import type { CashEvent, Position, Transaction } from '../src/types';
import { buildCashLedger } from '../src/math/cashLedger';
import { moneyWeightedReturn, xirr } from '../src/math/xirr';
import { buildRebalancePlan, simulateTradeWhatIf } from '../src/math/rebalancing';

const tx = (id: string, type: 'BUY' | 'SELL', quantity: number, price: number, timestamp: string, currency = 'USD'): Transaction => ({
  id, portfolio_id: 'p', symbol: 'AAPL', type, quantity, price, currency, timestamp, created_at: timestamp,
});
const cash = (id: string, kind: CashEvent['kind'], amount: number, timestamp: string, currency = 'USD'): CashEvent => ({
  id, portfolio_id: 'p', kind, amount, currency, timestamp, created_at: timestamp,
});

describe('cash ledger', () => {
  it('reconciles deposits, trades, dividends and fees without inventing cash', () => {
    const ledger = buildCashLedger(
      [tx('b', 'BUY', 6, 100, '2025-01-02T15:00:00Z')],
      [cash('d', 'DEPOSIT', 1000, '2025-01-01T10:00:00Z'), cash('div', 'DIVIDEND', 20, '2025-06-01T10:00:00Z'), cash('fee', 'FEE', 5, '2025-06-02T10:00:00Z')],
      '2025-12-31T23:00:00Z',
    );
    expect(ledger.complete).toBe(true);
    expect(ledger.balance).toBe(415);
    expect(ledger.deposits).toBe(1000);
    expect(ledger.dividends).toBe(20);
    expect(ledger.fees).toBe(5);
  });

  it('marks an unfunded trade as incomplete instead of assuming a deposit', () => {
    const ledger = buildCashLedger([tx('b', 'BUY', 1, 100, '2025-01-02T15:00:00Z')], []);
    expect(ledger.complete).toBe(false);
    expect(ledger.balance).toBe(-100);
    expect(ledger.reason).toContain('Cash ledger неполный');
  });

  it('refuses to add mixed currencies without an FX history', () => {
    const ledger = buildCashLedger(
      [tx('b', 'BUY', 1, 100, '2025-01-02T15:00:00Z', 'USD')],
      [cash('d', 'DEPOSIT', 100, '2025-01-01T10:00:00Z', 'EUR')],
      '2025-12-31T23:00:00Z',
    );
    expect(ledger.complete).toBe(false);
    expect(ledger.balance).toBe(0);
    expect(ledger.entries).toEqual([]);
    expect(ledger.reason).toContain('смешанные валюты');
  });

  it('refuses a single non-base currency instead of treating it as portfolio cash', () => {
    const ledger = buildCashLedger(
      [tx('b', 'BUY', 1, 100, '2025-01-02T15:00:00Z', 'EUR')],
      [cash('d', 'DEPOSIT', 100, '2025-01-01T10:00:00Z', 'EUR')],
      '2025-12-31T23:00:00Z',
      'USD',
    );
    expect(ledger.complete).toBe(false);
    expect(ledger.reason).toContain('базовой валюте USD');
    expect(ledger.reason).toContain('FX-конвертация');
  });
});

describe('XIRR / money-weighted return', () => {
  it('solves a simple one-year 10% return', () => {
    const rate = xirr([
      { date: '2025-01-01T00:00:00Z', amount: -1000 },
      { date: '2026-01-01T00:00:00Z', amount: 1100 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.1, 3);
  });

  it('uses only external deposits/withdrawals and terminal account value', () => {
    const result = moneyWeightedReturn(
      [cash('d', 'DEPOSIT', 1000, '2025-01-01T00:00:00Z'), cash('div', 'DIVIDEND', 50, '2025-06-01T00:00:00Z')],
      1100,
      '2026-01-01T00:00:00Z',
      true,
    );
    expect(result.cashFlowCount).toBe(1);
    expect(result.xirr).not.toBeNull();
    expect(result.xirr!).toBeCloseTo(0.1, 3);
  });

  it('refuses MWR when funding history is incomplete', () => {
    expect(moneyWeightedReturn([], 1000, '2026-01-01T00:00:00Z', false).xirr).toBeNull();
  });
});

describe('target allocation, rebalancing and what-if', () => {
  const positions: Position[] = [
    { symbol: 'AAPL', quantity: 6, averageCost: 80, costBasis: 480, realizedPnL: 0, marketPrice: 100, marketValue: 600 },
    { symbol: 'MSFT', quantity: 3, averageCost: 90, costBasis: 270, realizedPnL: 0, marketPrice: 100, marketValue: 300 },
  ];
  const targets = [{ symbol: 'AAPL', weight: 0.5 }, { symbol: 'MSFT', weight: 0.4 }];

  it('decomposes the rebalance against an explicit cash target', () => {
    const plan = buildRebalancePlan(positions, 100, targets, true, true);
    expect(plan.available).toBe(true);
    expect(plan.totalValue).toBe(1000);
    expect(plan.targetCashWeight).toBeCloseTo(0.1);
    expect(plan.rows.find((row) => row.symbol === 'AAPL')?.delta).toBe(-100);
    expect(plan.rows.find((row) => row.symbol === 'MSFT')?.delta).toBe(100);
    expect(plan.drift).toBeCloseTo(0.1);
  });

  it('shows whether a hypothetical trade improves target drift', () => {
    const whatIfTargets = [{ symbol: 'AAPL', weight: 0.5 }, { symbol: 'MSFT', weight: 0.3 }];
    const result = simulateTradeWhatIf(positions, 100, whatIfTargets, true, true, { symbol: 'AAPL', type: 'SELL', quantity: 1, price: 100 });
    expect(result.valid).toBe(true);
    expect(result.cashAfter).toBe(200);
    expect(result.targetDriftAfter!).toBeLessThan(result.targetDriftBefore!);
    expect(result.targetDriftAfter).toBeCloseTo(0);
  });

  it('rejects a buy that spends more reconciled cash than available', () => {
    const result = simulateTradeWhatIf(positions, 100, targets, true, true, { symbol: 'MSFT', type: 'BUY', quantity: 2, price: 100 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('недостаточно');
  });
});