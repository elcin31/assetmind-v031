import { describe, expect, it } from 'vitest';
import { minimumVariancePortfolio, minimumVarianceWeights, projectToSimplex } from '../src/math/portfolioOptimization';
import { historicalStressWindows } from '../src/math/historicalStress';
import type { DatedReturn } from '../src/types/analytics';

describe('long-only minimum variance optimizer', () => {
  it('projects arbitrary vectors onto the long-only fully-invested simplex', () => {
    const projected = projectToSimplex([1.2, -0.1, 0.4])!;
    expect(projected.every((value) => value >= 0)).toBe(true);
    expect(projected.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  });

  it('matches inverse-variance weights for two uncorrelated assets', () => {
    const result = minimumVarianceWeights([[0.04, 0], [0, 0.09]])!;
    expect(result.weights[0]).toBeCloseTo(0.09 / 0.13, 5);
    expect(result.weights[1]).toBeCloseTo(0.04 / 0.13, 5);
    expect(result.weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
  });

  it('never reports a higher optimized variance than the current feasible portfolio', () => {
    const result = minimumVariancePortfolio(
      ['A', 'B', 'C'],
      [0.7, 0.2, 0.1],
      [[0.04, 0.006, 0.004], [0.006, 0.09, 0.012], [0.004, 0.012, 0.16]],
    )!;
    expect(result.optimizedWeights.every((value) => value >= -1e-12)).toBe(true);
    expect(result.optimizedWeights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
    expect(result.optimizedVolatility).toBeLessThanOrEqual(result.currentVolatility + 1e-10);
    expect(result.turnover).toBeGreaterThanOrEqual(0);
  });
});

describe('historical proxy stress windows', () => {
  const chain: DatedReturn[] = [
    { startDate: '2026-01-01', date: '2026-01-02', value: -0.02 },
    { startDate: '2026-01-02', date: '2026-01-03', value: -0.03 },
    { startDate: '2026-01-03', date: '2026-01-04', value: 0.01 },
    { startDate: '2026-01-04', date: '2026-01-05', value: -0.05 },
  ];

  it('finds the worst compounded contiguous window', () => {
    const result = historicalStressWindows(chain, [1, 2]);
    expect(result.find((item) => item.window === 1)?.return).toBeCloseTo(-0.05);
    expect(result.find((item) => item.window === 2)?.return).toBeCloseTo((0.98 * 0.97) - 1);
  });

  it('does not bridge a missing interval', () => {
    const withGap = [
      ...chain.slice(0, 2),
      { startDate: '2026-01-10', date: '2026-01-11', value: -0.2 },
      { startDate: '2026-01-11', date: '2026-01-12', value: -0.1 },
    ];
    const result = historicalStressWindows(withGap, [3]);
    expect(result).toEqual([]);
  });
});
