import { describe, expect, it } from 'vitest';
import { concentration, concentrationSummary } from '../src/math/lab';
import { buildXRayInsights, HIGH_AVERAGE_PAIRWISE_CORRELATION } from '../src/math/xrayInsights';

describe('portfolio concentration', () => {
  it('calculates HHI and effective holdings for normalized and unnormalized weights', () => {
    expect(concentration([.25, .25, .25, .25])).toEqual({ hhi: .25, effectivePositions: 4 });
    expect(concentration([50, 50])).toEqual({ hhi: .5, effectivePositions: 2 });
    expect(concentration([NaN])).toBeNull();
    expect(concentration([Infinity])).toBeNull();
    expect(concentration([0, 0])).toBeNull();
  });
  it('summarizes current position concentration only for complete normalized weights', () => {
    expect(concentrationSummary([
      { symbol: 'AAA', weight: .6, marketValue: 60 },
      { symbol: 'BBB', weight: .25, marketValue: 25 },
      { symbol: 'CCC', weight: .15, marketValue: 15 },
    ])).toMatchObject({ largestPositionWeight: .6, top3Weight: 1, top5Weight: 1, effectivePositions: 1 / (.6 ** 2 + .25 ** 2 + .15 ** 2) });
    expect(concentrationSummary([{ symbol: 'AAA', weight: .5, marketValue: 50 }])).toBeNull();
  });
  it('detects position thresholds and ranks high severity first', () => {
    const results = buildXRayInsights({ positions: [{ symbol: 'AAA', weight: .32, riskContribution: null }], averagePairwiseCorrelation: null, currentDrawdown: null, maxDrawdown: null, commonObservations: 20, requiredObservations: 20 });
    expect(results[0]).toMatchObject({ severity: 'high', symbol: 'AAA' });
    expect(results[0].message).toContain('32,0%');
  });
  it('detects risk concentration and low effective diversification', () => {
    const positions = [{ symbol: 'AAA', weight: .65, riskContribution: .98 }, ...Array.from({ length: 5 }, (_, i) => ({ symbol: `B${i}`, weight: .07, riskContribution: .004 }))];
    const results = buildXRayInsights({ positions, averagePairwiseCorrelation: HIGH_AVERAGE_PAIRWISE_CORRELATION, currentDrawdown: null, maxDrawdown: null, commonObservations: 20, requiredObservations: 20 });
    expect(results.some(item => item.id === 'risk-AAA')).toBe(true);
    expect(results.some(item => item.id === 'low-effective-diversification')).toBe(true);
    expect(results.some(item => item.id === 'high-correlation')).toBe(true);
  });
  it('flags low diversification ratio, high beta, and relative active drawdown factually', () => {
    const base = { positions: [], averagePairwiseCorrelation: null, currentDrawdown: null, maxDrawdown: null, commonObservations: 60, requiredObservations: 60 };
    expect(buildXRayInsights({ ...base, diversificationRatio: 1.05 }).some(item => item.id === 'low-diversification-ratio')).toBe(true);
    expect(buildXRayInsights({ ...base, portfolioBeta: 1.4 }).some(item => item.id === 'high-benchmark-beta')).toBe(true);
    expect(buildXRayInsights({ ...base, activeDrawdown: -.08 }).some(item => item.id === 'large-active-drawdown')).toBe(true);
    expect(buildXRayInsights({ ...base, currentDrawdown: -.12 }).some(item => item.id === 'large-current-drawdown')).toBe(true);
  });
  it('handles missing and zero denominators without non-finite observations', () => {
    const results = buildXRayInsights({ positions: [{ symbol: 'AAA', weight: 0, riskContribution: 1 }, { symbol: 'BBB', weight: NaN, riskContribution: Infinity }], averagePairwiseCorrelation: Infinity, currentDrawdown: -Infinity, maxDrawdown: 0, commonObservations: 0, requiredObservations: 20 });
    expect(results.every(item => item.metric == null || Number.isFinite(item.metric))).toBe(true);
    expect(results.some(item => item.id === 'limited-risk-sample')).toBe(true);
    expect(results.some(item => item.id.startsWith('risk-'))).toBe(false);
  });
});
