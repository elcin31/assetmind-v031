import { expect, it } from 'vitest';
import { DEFAULT_ANALYTICS_PREFERENCES, normalizeAnalyticsPreferences } from '../src/analytics/preferences';

it('normalizes analytics preferences without accepting invalid enum or rate values', () => {
  expect(normalizeAnalyticsPreferences(null)).toEqual(DEFAULT_ANALYTICS_PREFERENCES);
  expect(normalizeAnalyticsPreferences({ period: '5Y', benchmark: 'BTC', rf: 999, mar: -999 })).toEqual({
    period: '1Y', benchmark: 'SPY', rf: 100, mar: -10,
  });
  expect(normalizeAnalyticsPreferences({ period: 'YTD', benchmark: 'QQQ', rf: 4.25, mar: 2 })).toEqual({
    period: 'YTD', benchmark: 'QQQ', rf: 4.25, mar: 2,
  });
});
