import { describe, expect, it } from 'vitest';
import {
  applyPaymentToOutstanding,
  settleReturnAgainstOutstanding,
  validateReturnQuantity,
} from './transactions';

describe('transaction integrity utilities', () => {
  it('limits cumulative returns to the original quantity', () => {
    expect(validateReturnQuantity(10, 3, 4)).toBe(7);
    expect(() => validateReturnQuantity(10, 8, 3)).toThrow('Only 2');
  });

  it('requires positive whole-number return quantities', () => {
    expect(() => validateReturnQuantity(10, 0, 0)).toThrow(/greater than zero/);
    expect(() => validateReturnQuantity(10, 0, 1.5)).toThrow(/whole number/);
  });

  it('uses a return to reduce outstanding before creating credit', () => {
    expect(settleReturnAgainstOutstanding(80, 100)).toEqual({
      outstandingAdjusted: 80,
      creditCreated: 0,
      newOutstanding: 20,
    });
    expect(settleReturnAgainstOutstanding(125.55, 100.1)).toEqual({
      outstandingAdjusted: 100.1,
      creditCreated: 25.45,
      newOutstanding: 0,
    });
  });

  it('prevents overpayment and preserves paise precision', () => {
    expect(applyPaymentToOutstanding(100.1, 33.33)).toBe(66.77);
    expect(() => applyPaymentToOutstanding(100, 100.01)).toThrow(/cannot exceed/);
    expect(() => applyPaymentToOutstanding(0, 1)).toThrow(/fully paid/);
  });
});
