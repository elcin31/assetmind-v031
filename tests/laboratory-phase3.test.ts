import { describe, expect, it } from 'vitest';
import type { CorrelationMatrix, DatedReturn } from '../src/types/analytics';
import { scenarioValue } from '../src/math/scenarios';
import { currentWeightsHistoricalReplay } from '../src/math/historicalStress';
import { efficientFrontier } from '../src/math/portfolioOptimization';
import { evaluateWhatIfPortfolio, normalizeScenarioWeights } from '../src/math/whatIf';

const pairedReturns = (): DatedReturn[][] => [0, 1].map((asset) => Array.from({ length: 40 }, (_, index) => {
  const start = new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
  const date = new Date(Date.UTC(2025, 0, 2 + index)).toISOString().slice(0, 10);
  const base = (index % 2 ? 0.012 : -0.006) + index * 0.00008;
  return { startDate: start, date, value: asset === 0 ? base : base * 0.5 + (index % 3 ? 0.004 : -0.003) };
}));

function matrix(): CorrelationMatrix {
  const returns = pairedReturns();
  return {
    symbols: ['AAA', 'BBB'],
    covariance: [[0.04, 0.006], [0.006, 0.09]],
    correlation: [[1, 0.1], [0.1, 1]],
    returns,
    observations: 40,
  };
}

describe('Phase 3 deterministic Laboratory math', () => {
  it('computes single and mixed asset stress, including dollar and percentage impact', () => {
    const stress = scenarioValue([{ symbol: 'A', value: 200 }, { symbol: 'B', value: 300 }], { A: -0.1, B: 0.2 });
    expect(stress?.impact).toBeCloseTo(40);
    expect(stress?.percentage).toBeCloseTo(0.08);
    expect(stress?.assetImpacts.map((item) => item.impactValue)).toEqual([-20, 60]);
    expect(scenarioValue([{ symbol: 'A', value: 100 }], { A: -0.25 })?.percentage).toBeCloseTo(-0.25);
    expect(scenarioValue([{ symbol: 'A', value: 0 }], { A: -0.25 })).toBeNull();
    expect(scenarioValue([{ symbol: 'A', value: 100 }], { A: Number.NaN })).toBeNull();
    expect(scenarioValue([{ symbol: 'A', value: 100 }], {})).toBeNull();
  });

  it('replays current weights only across common exact historical intervals', () => {
    const assets = pairedReturns();
    const replay = currentWeightsHistoricalReplay(['AAA', 'BBB'], [0.25, 0.75], assets, [1, 5, 20]);
    expect(replay.map((item) => item.window)).toEqual([1, 5, 20]);
    expect(replay.every((item) => Number.isFinite(item.return) && item.observations === item.window)).toBe(true);
    const gap = assets.map((series) => series.slice());
    gap[1] = gap[1].filter((item) => item.date !== assets[1][14].date);
    expect(currentWeightsHistoricalReplay(['AAA', 'BBB'], [0.5, 0.5], gap, [40])).toEqual([]);
    expect(currentWeightsHistoricalReplay(['AAA'], [1], [assets[0]], [1]).length).toBe(1);
  });

  it('evaluates scenario risk on the existing common matrix and normalizes only on explicit call', () => {
    const benchmark = pairedReturns()[0];
    const current = evaluateWhatIfPortfolio(['AAA', 'BBB'], [0.5, 0.5], matrix(), benchmark, 0);
    const reset = evaluateWhatIfPortfolio(['AAA', 'BBB'], normalizeScenarioWeights([0.5, 0.5])!, matrix(), benchmark, 0);
    expect(reset).toEqual(current);
    expect(current.volatility).not.toBeNull();
    expect(current.beta).not.toBeNull();
    expect(current.riskContributions.reduce((sum, item) => sum + item.contribution, 0)).toBeCloseTo(1);
    expect(evaluateWhatIfPortfolio(['AAA', 'BBB'], [0.3, 0.3], matrix(), benchmark, 0).volatility).toBeNull();
    expect(normalizeScenarioWeights([Number.NaN, 1])).toBeNull();
    expect(normalizeScenarioWeights([-1, 2])).toBeNull();
    expect(normalizeScenarioWeights([1, 3])).toEqual([0.25, 0.75]);
  });

  it('builds a deterministic long-only efficient frontier with feasible special portfolios', () => {
    const returns = pairedReturns().map((series) => series.map((item) => item.value));
    const covariance = [[0.04, 0.006], [0.006, 0.09]];
    const first = efficientFrontier(['AAA', 'BBB'], [0.5, 0.5], returns, covariance, 0.01);
    const second = efficientFrontier(['AAA', 'BBB'], [0.5, 0.5], returns, covariance, 0.01);
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first?.points.length).toBeGreaterThan(1);
    for (const point of [first!.current, first!.minimumVariance, first!.maximumHistoricalSharpe, ...first!.points]) {
      expect(point.weights.every((weight) => weight >= 0 && Number.isFinite(weight))).toBe(true);
      expect(point.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
      expect(Number.isFinite(point.annualizedReturn)).toBe(true);
      expect(Number.isFinite(point.annualizedVolatility)).toBe(true);
    }
    expect(first?.minimumVariance.annualizedVolatility).toBeLessThanOrEqual(first!.current.annualizedVolatility + 1e-8);
    expect(efficientFrontier(['AAA'], [1], [returns[0]], [[0.04]], 0)).toBeNull();
    expect(efficientFrontier(['AAA', 'BBB'], [0.5, 0.5], returns.map((values) => values.slice(0, 19)), covariance, 0)).toBeNull();
    const singular = efficientFrontier(['AAA', 'BBB'], [0.5, 0.5], returns, [[0.04, 0.04], [0.04, 0.04]], 0);
    expect(singular === null || (singular.regularization > 0 && singular.points.every((point) => Number.isFinite(point.annualizedVolatility)))).toBe(true);
    expect(efficientFrontier(['AAA', 'BBB'], [0.5, 0.5], returns, [[Number.NaN, 0], [0, 0.1]], 0)).toBeNull();
  });
});
