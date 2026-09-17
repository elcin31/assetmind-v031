import { describe, expect, it } from 'vitest';
import type { CashEvent, Transaction } from '../src/types';
import { buildAccountBackup, planCashEventRestore, validateAccountBackup } from '../src/storage/accountBackup';

const portfolio = { id: 'portfolio-1', name: 'Main', base_currency: 'USD', created_at: '2025-01-01T00:00:00Z' };
const trade: Transaction = { id: 'trade-1', portfolio_id: portfolio.id, symbol: 'AAPL', type: 'BUY', quantity: 1, price: 100, currency: 'USD', timestamp: '2025-01-02T00:00:00Z', created_at: '2025-01-02T00:00:01Z', client_request_id: 'trade-request' };
const cash: CashEvent = { id: 'cash-1', portfolio_id: portfolio.id, kind: 'DEPOSIT', amount: 1000, currency: 'USD', timestamp: '2025-01-01T12:00:00Z', created_at: '2025-01-01T12:00:01Z', client_request_id: 'cash-request' };

const preferences = { period: '1Y' as const, riskHorizon: '60D' as const, benchmark: 'SPY' as const, rf: 2.5, mar: 0 };

describe('full account backup', () => {
  it('round-trips trades, cash events, targets and analytics preferences', () => {
    const backup = buildAccountBackup(
      { version: 1, portfolio, transactions: [trade] },
      { cashEvents: [cash], targetAllocation: [{ symbol: 'AAPL', weight: 0.8 }] },
      preferences,
      '2026-09-16T12:00:00Z',
    );
    const restored = validateAccountBackup(JSON.parse(JSON.stringify(backup)));
    expect(restored.transactions).toEqual([trade]);
    expect(restored.cashEvents).toEqual([cash]);
    expect(restored.targetAllocation).toEqual([{ symbol: 'AAPL', weight: 0.8 }]);
    expect(restored.analyticsPreferences).toEqual(preferences);
    expect(restored.analyticsPreferences.riskHorizon).toBe('60D');
  });

  it('defaults old backups without riskHorizon to 20D on restore', () => {
    const backup = buildAccountBackup(
      { version: 1, portfolio, transactions: [trade] },
      { cashEvents: [cash], targetAllocation: [] },
      preferences,
      '2026-09-16T12:00:00Z',
    );
    const legacyShape = JSON.parse(JSON.stringify(backup));
    delete legacyShape.analyticsPreferences.riskHorizon;
    expect(validateAccountBackup(legacyShape).analyticsPreferences.riskHorizon).toBe('20D');
  });

  it('rejects an ID reused across trade and cash namespaces', () => {
    const invalid = {
      format: 'assetmind-account-backup', version: 1, exportedAt: '2026-09-16T12:00:00Z', portfolio,
      transactions: [trade], cashEvents: [{ ...cash, id: trade.id }], targetAllocation: [], analyticsPreferences: preferences,
    };
    expect(() => validateAccountBackup(invalid)).toThrow('both a trade and a cash event');
  });

  it('rejects damaged cash values before any restore writes', () => {
    const invalid = {
      format: 'assetmind-account-backup', version: 1, exportedAt: '2026-09-16T12:00:00Z', portfolio,
      transactions: [trade], cashEvents: [{ ...cash, amount: -1 }], targetAllocation: [], analyticsPreferences: preferences,
    };
    expect(() => validateAccountBackup(invalid)).toThrow('invalid or duplicate cash event');
  });

  it('plans an idempotent cash restore and rebinds the current portfolio', () => {
    const existing = [{ ...cash, portfolio_id: 'current' }];
    const incoming = [cash, { ...cash, id: 'cash-2', client_request_id: 'cash-request-2', kind: 'DIVIDEND' as const, amount: 25 }];
    const plan = planCashEventRestore(existing, incoming, 'current', 'USD');
    expect(plan.missing).toHaveLength(1);
    expect(plan.missing[0].portfolio_id).toBe('current');
    expect(plan.merged).toHaveLength(2);
  });

  it('rejects a conflicting cash event instead of overwriting it', () => {
    const existing = [{ ...cash, portfolio_id: 'current' }];
    expect(() => planCashEventRestore(existing, [{ ...cash, amount: 999 }], 'current', 'USD')).toThrow('conflicts with an existing cash event');
  });
});
