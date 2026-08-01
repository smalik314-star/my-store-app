import { describe, expect, it } from 'vitest';
import { getSaleConversionFactor, resolveSalePrice, toBaseQuantity } from './wholesale';

describe('wholesale helpers', () => {
  const product = {
    sellingPrice: 12,
    wholesalePrice: 10,
    unitsPerPack: 10,
    packsPerCase: 20,
  };

  it('converts pack and case quantities into base stock units', () => {
    expect(getSaleConversionFactor(product, 'unit')).toBe(1);
    expect(toBaseQuantity(product, 'pack', 2)).toBe(20);
    expect(toBaseQuantity(product, 'case', 2)).toBe(400);
  });

  it('uses wholesale rate only when configured and requested', () => {
    expect(resolveSalePrice(product, 'retail')).toBe(12);
    expect(resolveSalePrice(product, 'wholesale')).toBe(10);
    expect(resolveSalePrice(product, 'retail', { pricingTier: 'wholesale' })).toBe(10);
  });

  it('falls back to retail rate for legacy products', () => {
    expect(resolveSalePrice({ sellingPrice: 12 }, 'wholesale')).toBe(12);
  });
});
