import { describe, expect, it } from 'vitest';
import { calculatePositions } from '../src/math/positions';

describe('empty split-aware position engine', () => {
  it('still returns no positions', () => {
    expect(calculatePositions([])).toEqual({ positions: [], hadInvalidSell: false });
  });
});
