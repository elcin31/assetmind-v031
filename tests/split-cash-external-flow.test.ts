import { describe, expect, it } from 'vitest';
import { buildCashLedger } from '../src/math/cashLedger';
import type { Transaction } from '../src/types';

describe('split external flow neutrality', () => {
  it('creates neither cash entries nor external flows', () => {
    const rows: Transaction[] = [{
      id: 's', portfolio_id: 'p', symbol: 'XYZ', type: 'SPLIT', split_numerator: 2, split_denominator: 1,
      currency: 'USD', timestamp: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    }];
    const result = buildCashLedger(rows, [], '2026-01-02T00:00:00Z', 'USD');
    expect(result.entries.reduce((sum, entry) => sum + entry.externalFlow, 0)).toBe(0);
  });
});
