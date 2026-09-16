import { describe, expect, it } from 'vitest';
import type { DatedReturn } from '../src/types/analytics';
import { rollingMetric } from '../src/math/rolling';

function returnsWithOneGap(): DatedReturn[] {
  const result: DatedReturn[] = [];
  let previous = new Date(Date.UTC(2025, 0, 2));
  for (let i = 0; i < 55; i++) {
    const next = new Date(previous);
    next.setUTCDate(next.getUTCDate() + 1);
    while (next.getUTCDay() === 0 || next.getUTCDay() === 6)
      next.setUTCDate(next.getUTCDate() + 1);
    if (i === 25) {
      // Simulate one excluded trade/missing interval: the clean stream resumes
      // after the break without a fabricated bridge return.
      previous = next;
      continue;
    }
    result.push({
      startDate: previous.toISOString().slice(0, 10),
      date: next.toISOString().slice(0, 10),
      value: Math.sin(i * 0.4) * 0.01 + 0.0005,
    });
    previous = next;
  }
  return result;
}

describe('rolling analytics across excluded intervals', () => {
  it('does not bridge the gap and resumes after a fresh clean window accumulates', () => {
    const returns = returnsWithOneGap();
    const rolling = rollingMetric(returns, 20, 'volatility');
    expect(rolling).toHaveLength(returns.length);
    expect(rolling[19].value).not.toBeNull();
    const firstAfterGap = rolling.findIndex(
      (_, index) =>
        index > 20 &&
        returns[index].startDate !== returns[index - 1].date,
    );
    expect(firstAfterGap).toBeGreaterThan(0);
    expect(rolling[firstAfterGap].value).toBeNull();
    expect(rolling[firstAfterGap + 18].value).toBeNull();
    expect(rolling[firstAfterGap + 19].value).not.toBeNull();
  });
});
