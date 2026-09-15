import { describe, expect, it } from 'vitest';
import { chartGeometry, normalizePriceHistory } from '../src/utils/priceHistory';

describe('price chart provider data', () => {
  it('sorts dates, removes bad values and deduplicates days', () => {
    expect(normalizePriceHistory([
      { date: '2026-09-02', close: 20 }, { date: '2026-09-01', close: 10 },
      { date: '2026-09-02', close: 21 }, { date: 'bad', close: 3 },
      { date: '2026-09-03', close: 0 }, { date: '2026-09-04', close: Infinity },
      { date: '2026-09-05', close: '12' }, null,
    ])).toEqual([{ date: '2026-09-01', close: 10 }, { date: '2026-09-02', close: 21 }]);
    expect(normalizePriceHistory(null)).toEqual([]);
  });
  it('keeps flat and single-point data finite and in bounds', () => {
    for (const bars of [[{ date: '2026-09-01', close: 10 }], [{ date: '2026-09-01', close: 10 }, { date: '2026-09-02', close: 10 }]]) {
      const { points } = chartGeometry(bars);
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(16); expect(point.x).toBeLessThanOrEqual(584);
        expect(point.y).toBeGreaterThanOrEqual(16); expect(point.y).toBeLessThanOrEqual(204);
      }
    }
  });
  it('uses elapsed time for the x axis', () => {
    const { points } = chartGeometry([{ date: '2026-09-01', close: 10 }, { date: '2026-09-02', close: 20 }, { date: '2026-09-05', close: 15 }]);
    expect(points.map(p => p.x)).toEqual([16, 158, 584]);
    expect(points[1].y).toBeLessThan(points[0].y);
  });
});
