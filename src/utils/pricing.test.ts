import { describe, expect, it } from 'vitest';
import { calculateLossSale } from './pricing';

describe('calculateLossSale', () => {
  it('calculates per-unit and total loss below purchase rate', () => {
    expect(calculateLossSale(85, 100, 3)).toEqual({
      isLoss: true,
      lossPerUnit: 15,
      totalLoss: 45,
    });
  });

  it('does not report a loss at or above purchase rate', () => {
    expect(calculateLossSale(100, 100, 3)).toEqual({
      isLoss: false,
      lossPerUnit: 0,
      totalLoss: 0,
    });
    expect(calculateLossSale(120, 100, 3).isLoss).toBe(false);
  });

  it('handles decimal rates using the shared money rounding policy', () => {
    expect(calculateLossSale(99.995, 100.105, 2)).toEqual({
      isLoss: true,
      lossPerUnit: 0.11,
      totalLoss: 0.22,
    });
  });
});
