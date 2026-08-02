import { describe, expect, it } from 'vitest';
import { sumInvoiceProfit } from './aiMetrics';

describe('sumInvoiceProfit', () => {
  it('adds profit from every invoice line', () => {
    expect(sumInvoiceProfit([
      {
        items: [
          { price: 15, purchaseCost: 10, quantity: 2 },
          { price: 8, purchaseCost: 5, quantity: 1 },
        ],
      },
      {
        items: [
          { price: 20, purchaseCost: 11, quantity: 3 },
        ],
      },
    ])).toBe(40);
  });

  it('treats missing values as zero instead of fabricating profit', () => {
    expect(sumInvoiceProfit([
      {
        items: [
          { price: 10, quantity: 2 },
          { purchaseCost: 4, quantity: 3 },
          { price: 12, purchaseCost: 7 },
        ],
      },
    ])).toBe(8);
  });
});
