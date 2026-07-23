import { describe, expect, it } from 'vitest';
import {
  addMoney,
  calculateLineTax,
  formatCurrency,
  fromPaise,
  roundMoney,
  subtractMoney,
  toPaise,
} from './currency';

describe('INR financial utilities', () => {
  it('formats Indian currency grouping with two decimals', () => {
    expect(formatCurrency(0)).toBe('₹0.00');
    expect(formatCurrency(125000)).toBe('₹1,25,000.00');
    expect(formatCurrency(1000000)).toBe('₹10,00,000.00');
  });

  it('performs decimal-safe addition and subtraction in paise', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(subtractMoney(100, 33.33)).toBe(66.67);
    expect(toPaise(123.456)).toBe(12346);
    expect(fromPaise(12346)).toBe(123.46);
    expect(roundMoney(10.005)).toBe(10.01);
  });

  it('splits intrastate GST without losing a paise', () => {
    const result = calculateLineTax({ quantity: 3, rate: 99.99, gstRate: 12 });
    expect(result.gross).toBe(299.97);
    expect(result.taxable).toBe(299.97);
    expect(result.cgst + result.sgst).toBe(result.tax);
    expect(result.total).toBe(addMoney(result.taxable, result.tax));
  });

  it('uses IGST for interstate lines', () => {
    const result = calculateLineTax({ quantity: 2, rate: 100, gstRate: 18, interstate: true });
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.igst).toBe(36);
    expect(result.total).toBe(236);
  });

  it('rejects invalid financial inputs', () => {
    expect(() => calculateLineTax({ quantity: 0, rate: 10 })).toThrow(/Quantity/);
    expect(() => calculateLineTax({ quantity: 1, rate: -1 })).toThrow(/Rate/);
    expect(() => calculateLineTax({ quantity: 1, rate: 10, discount: 11 })).toThrow(/Discount/);
  });
});
