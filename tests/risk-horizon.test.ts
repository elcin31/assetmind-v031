import { describe, expect, it } from 'vitest';
import type { HistoryBar } from '../src/types';
import type { DatedReturn, PortfolioHistoryPoint, RiskHorizon } from '../src/types/analytics';
import {
  HISTORICAL_TAIL_MIN_OBSERVATIONS,
  RISK_HORIZON_INTERVALS,
  buildRiskReturnMatrix,
  resolveRiskHorizon,
  selectActualPortfolioRiskWindow,
  selectRiskWindow,
} from '../src/math/riskHorizon';
import { historicalTailRisk } from '../src/math/ratios';

function datedReturns(count: number): DatedReturn[] {
  return Array.from({ length: count }, (_, index) => ({
    startDate: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
    date: new Date(Date.UTC(2025, 0, index + 2)).toISOString().slice(0, 10),
    value: ((index % 7) - 3) / 1000,
  }));
}

function bars(count: number, phase = 0): HistoryBar[] {
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
    close: 100 * (1 + index * 0.001 + Math.sin((index + phase) / 2) * 0.01),
  }));
}

function constantReturnBars(count: number): HistoryBar[] {
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
    close: 100 * 1.01 ** index,
  }));
}

describe('risk horizon configuration and exact windows', () => {
  it.each([
    ['20D', 20, 30],
    ['60D', 60, 100],
    ['1Y', 252, 300],
  ] as const)('selects the latest exact %s window', (horizon, required, available) => {
    expect(resolveRiskHorizon(horizon).intervals).toBe(required);
    const input = datedReturns(available);
    const result = selectRiskWindow(input, horizon);
    expect(result.available).toBe(true);
    expect(result.returns).toHaveLength(required);
    expect(result.returns).toEqual(input.slice(-required));
  });

  it.each([
    ['20D', 19],
    ['60D', 59],
    ['1Y', 251],
  ] as const)('leaves %s unavailable rather than relabelling a short sample', (horizon, count) => {
    const result = selectRiskWindow(datedReturns(count), horizon);
    expect(result.available).toBe(false);
    expect(result.returns).toEqual([]);
    expect(result.availableObservations).toBe(count);
    expect(result.reason).toContain(`Доступно: ${count}`);
  });

  it('keeps the centralized interval mapping as the single source of truth', () => {
    expect(RISK_HORIZON_INTERVALS).toEqual({ '20D': 20, '60D': 60, '1Y': 252 });
  });
});

describe('common covariance sample', () => {
  it('rejects 20D when one holding has only 19 common intervals', () => {
    const result = buildRiskReturnMatrix(
      ['AAPL', 'AMD', 'PLTR'],
      new Map([
        ['AAPL', bars(26, 0)],
        ['AMD', bars(24, 1)],
        ['PLTR', bars(20, 2)],
      ]),
      '20D',
    );
    expect(result.matrix).toBeNull();
    expect(result.commonObservations).toBe(19);
    expect(result.reason).toContain('Доступно: 19');
  });

  it('uses the same latest 20 exact start/end intervals for every asset', () => {
    const result = buildRiskReturnMatrix(
      ['AAPL', 'AMD', 'PLTR'],
      new Map([
        ['AAPL', bars(31, 0)],
        ['AMD', bars(31, 1)],
        ['PLTR', bars(31, 2)],
      ]),
      '20D',
    );
    expect(result.matrix?.observations).toBe(20);
    expect(result.matrix?.returns.every((row) => row.length === 20)).toBe(true);
    const intervalKeys = result.matrix!.returns.map((row) =>
      row.map((r) => `${r.startDate}/${r.date}`),
    );
    expect(intervalKeys[1]).toEqual(intervalKeys[0]);
    expect(intervalKeys[2]).toEqual(intervalKeys[0]);
  });

  it('does not bridge a missing quote into a normal one-day common return', () => {
    const full = bars(22, 0);
    const missingMiddle = bars(22, 1).filter((_, index) => index !== 10);
    const result = buildRiskReturnMatrix(
      ['AAPL', 'AMD'],
      new Map([
        ['AAPL', full],
        ['AMD', missingMiddle],
      ]),
      '20D',
    );
    // AMD has a two-date bridge around the missing bar, but that interval does
    // not match AAPL's exact endpoints. The two affected one-day intervals are
    // therefore excluded instead of being replaced by zero or stitched.
    expect(result.commonObservations).toBe(19);
    expect(result.matrix).toBeNull();
  });

  it('keeps correlation-based analytics unavailable for a zero-variance asset', () => {
    const result = buildRiskReturnMatrix(
      ['FLAT_RETURN', 'VARIABLE'],
      new Map([
        ['FLAT_RETURN', constantReturnBars(25)],
        ['VARIABLE', bars(25, 3)],
      ]),
      '20D',
    );
    expect(result.commonObservations).toBeGreaterThanOrEqual(20);
    expect(result.matrix).toBeNull();
    expect(result.reason).toContain('нулевая дисперсия');
  });
});

describe('actual portfolio risk and tail risk', () => {
  it('does not reach backward across an unknown actual return to fill 20D', () => {
    const points: PortfolioHistoryPoint[] = Array.from({ length: 25 }, (_, index) => ({
      date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
      value: 100 + index,
      externalFlow: 0,
      traded: false,
      dailyReturn: index === 0 ? null : 0.001 + (index % 3) * 0.0001,
    }));
    points[10] = { ...points[10], dailyReturn: null, traded: true, externalFlow: null };
    // The null is older than the latest 20 slots here, so it is legitimately outside 20D.
    expect(selectActualPortfolioRiskWindow(points, '20D').available).toBe(true);

    points[20] = { ...points[20], dailyReturn: null, traded: true, externalFlow: null };
    const blocked = selectActualPortfolioRiskWindow(points, '20D');
    expect(blocked.available).toBe(false);
    expect(blocked.availableObservations).toBe(19);
    expect(blocked.reason).toContain('не перескакиваются');
  });

  it('requires 60 observations for historical VaR and Expected Shortfall in horizon analytics', () => {
    const twenty = datedReturns(20).map((r) => r.value);
    const sixty = datedReturns(60).map((r) => r.value);
    expect(
      historicalTailRisk(twenty, 0.95, HISTORICAL_TAIL_MIN_OBSERVATIONS),
    ).toBeNull();
    expect(
      historicalTailRisk(sixty, 0.95, HISTORICAL_TAIL_MIN_OBSERVATIONS),
    ).not.toBeNull();
  });

  it.each(['20D', '60D', '1Y'] as RiskHorizon[])('never fabricates observations for %s', (horizon) => {
    const required = RISK_HORIZON_INTERVALS[horizon];
    const result = selectRiskWindow(datedReturns(required - 1), horizon);
    expect(result.available).toBe(false);
    expect(result.returns).toHaveLength(0);
  });
});
