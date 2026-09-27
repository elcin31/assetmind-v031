import { describe, expect, it, vi } from 'vitest';
import { buildDemoPortfolio, demoPresets } from '../src/data/demoPortfolios';
import { activePortfolioSnapshot } from '../src/data/demoPortfolioState';
import { deliverBestEffort, sanitizeAnalyticsProperties } from '../src/analytics/events';
import { sanitizeShareData } from '../src/components/growth/shareData';
import type { Quote } from '../src/types';

const sampleQuotes = (symbols: string[]) => new Map<string, Quote>(symbols.map(symbol => [symbol, {
  symbol, price: 100, change: 0, changePercent: 0, timestamp: null,
}]));

describe('Growth Layer', () => {
  it('keeps demo data in a synthetic snapshot and preserves the real snapshot for exit', () => {
    const real = { marker: 'real' } as never;
    const demo = buildDemoPortfolio('balanced-tech', sampleQuotes(['AAPL', 'MSFT', 'NVDA', 'SPY']));
    expect(demo.transactions).toHaveLength(4);
    expect(demo.transactions.every(tx => tx.portfolio_id.startsWith('demo-'))).toBe(true);
    expect(demo.transactions.map(tx => tx.symbol).sort()).toEqual(['AAPL', 'MSFT', 'NVDA', 'SPY']);
    expect(activePortfolioSnapshot(real, demo)).toBe(demo);
    expect(activePortfolioSnapshot(real, null)).toBe(real);
    expect((real as { marker: string }).marker).toBe('real');
  });

  it('provides at most five educational presets with normalized weights', () => {
    expect(demoPresets.length).toBeLessThanOrEqual(5);
    for (const preset of demoPresets) expect(Object.values(preset.weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it('strips sensitive analytics payload keys and non-finite values', () => {
    expect(sanitizeAnalyticsProperties({ benchmark: 'SPY', portfolioSize: 4, email: 'a@b.com', symbol: 'NVDA', userId: 'uuid', score: Number.NaN }))
      .toEqual({ benchmark: 'SPY', portfolioSize: 4 });
  });

  it('absorbs synchronous and asynchronous analytics delivery failures', async () => {
    const onUnhandled = vi.fn();
    deliverBestEffort(() => Promise.reject(new Error('offline')));
    expect(() => deliverBestEffort(() => { throw new Error('offline'); })).not.toThrow();
    await Promise.resolve();
    expect(onUnhandled).not.toHaveBeenCalled();
  });

  it('sanitizes shared card data and omits private or monetary values', () => {
    expect(sanitizeShareData([
      { label: 'Volatility', value: '18.2%' },
      { label: 'Account value', value: '$10,000' },
      { label: 'Email', value: 'person@example.com' },
      { label: 'Beta', value: '—' },
    ], ['NVDA weight is 31%', 'Account value $10,000', 'user 123e4567-e89b-12d3-a456-426614174000']))
      .toEqual({ metrics: [{ label: 'Volatility', value: '18.2%' }], insights: ['NVDA weight is 31%'] });
  });
});
