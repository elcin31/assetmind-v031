import { expect, it } from 'vitest';
import { concentration, historicalRisk, stressValue } from '../src/math/lab';
it('measures equal and concentrated portfolios', () => {
  expect(concentration([25,25,25,25])).toEqual({ hhi: .25, effectivePositions: 4 });
  expect(concentration([1])).toEqual({ hhi: 1, effectivePositions: 1 });
  expect(concentration([])).toBeNull(); expect(concentration([0])).toBeNull();
});
it('applies a scenario only to the selected asset', () => {
  const values=[{symbol:'AAPL',value:100},{symbol:'PLTR',value:200}];
  expect(stressValue(values,-.2,'PLTR')).toEqual({current:300,change:-40,after:260});
  expect(stressValue(values,.1,'*')).toEqual({current:300,change:30,after:330});
});
it('computes empirical daily tails and peak-to-trough drawdown', () => {
  const returns=[-.2,-.1,...Array<number>(38).fill(.01)];
  const values=[100];for(const r of returns)values.push(values.at(-1)!*(1+r));
  const risk=historicalRisk(values,returns)!;
  expect(risk.var95).toBe(.1);expect(risk.es95).toBeCloseTo(.15);expect(risk.maxDrawdown).toBeCloseTo(.28);
});
it('does not produce risk estimates from insufficient or invalid data', () => {
  expect(historicalRisk([100,90],[-.1])).toBeNull();
  expect(historicalRisk(Array(21).fill(100),Array(20).fill(NaN))).toBeNull();
  expect(historicalRisk(Array(21).fill(100),Array(20).fill(0))?.var95).toBe(0);
});
