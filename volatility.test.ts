import { describe, it, expect } from 'vitest';
import { annualizedVolatility } from '../src/math/volatility';
import { calculateSharpe } from '../src/math/sharpe';

describe('annualizedVolatility', () => {
  it('returns null for insufficient data', () => {
    expect(annualizedVolatility([])).toBeNull();
    expect(annualizedVolatility([0.01])).toBeNull();
  });

  it('handles constant returns (zero vol)', () => {
    const returns = [0.01, 0.01, 0.01, 0.01, 0.01];
    const vol = annualizedVolatility(returns);
    expect(vol).toBe(0);
  });

  it('produces finite positive value for normal series', () => {
    const returns = [0.01, -0.005, 0.02, -0.01, 0.015, 0.0, -0.008];
    const vol = annualizedVolatility(returns);
    expect(vol).not.toBeNull();
    expect(Number.isFinite(vol!)).toBe(true);
    expect(vol!).toBeGreaterThan(0);
  });
});

describe('calculateSharpe', () => {
  it('returns null when vol is null or zero', () => {
    expect(calculateSharpe([0.01, 0.02], null)).toBeNull();
    expect(calculateSharpe([0.01, 0.02], 0)).toBeNull();
  });

  it('returns finite number for normal inputs', () => {
    const returns = [0.001, 0.002, -0.001, 0.0015, 0.0005];
    const vol = 0.15;
    const sharpe = calculateSharpe(returns, vol, 0);
    expect(sharpe).not.toBeNull();
    expect(Number.isFinite(sharpe!)).toBe(true);
  });
});
