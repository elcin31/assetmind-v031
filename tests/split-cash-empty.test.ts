import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';

describe('empty split-aware cash ledger', () => {
  it('remains complete at zero', () => {
    const result = buildCashLedger([], [], '2026-01-01T00:00:00Z', 'USD');
    expect(result.complete).toBe(true);
    expect(result.balance).toBe(0);
  });
});
