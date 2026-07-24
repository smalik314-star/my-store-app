import { describe, expect, it } from 'vitest';
import { calculateStockAdjustment, validateAdjustmentDirection } from './stock-adjustment';

describe('calculateStockAdjustment', () => {
  it('applies the batch difference to total product stock', () => {
    expect(calculateStockAdjustment(10, 7, 25)).toEqual({
      difference: -3,
      newProductStock: 22,
    });
    expect(calculateStockAdjustment(4, 9, 12)).toEqual({
      difference: 5,
      newProductStock: 17,
    });
  });

  it('rejects negative, fractional, unchanged, or invalid stock', () => {
    expect(() => calculateStockAdjustment(2, -1, 10)).toThrow('cannot be negative');
    expect(() => calculateStockAdjustment(2, 2.5, 10)).toThrow('whole numbers');
    expect(() => calculateStockAdjustment(2, 2, 10)).toThrow('different');
    expect(() => calculateStockAdjustment(2, Number.NaN, 10)).toThrow('valid numbers');
  });

  it('never permits a negative product total', () => {
    expect(() => calculateStockAdjustment(10, 0, 5)).toThrow('total product stock negative');
  });

  it('keeps operational reasons aligned with the stock direction', () => {
    expect(() => validateAdjustmentDirection('found', -1)).toThrow('increased');
    expect(() => validateAdjustmentDirection('expired', 1)).toThrow('reduced');
    expect(() => validateAdjustmentDirection('correction', -1)).not.toThrow();
    expect(() => validateAdjustmentDirection('other', 1)).not.toThrow();
  });
});
